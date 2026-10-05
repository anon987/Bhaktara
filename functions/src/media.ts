import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { FunctionsErrorCode, HttpsError } from "firebase-functions/v2/https";
import { editableStatuses } from "../../src/domain/cms";
import {
  MediaType,
  mediaTypeForContent,
  ProcessorErrorCode,
  ProcessRequest,
  processRequestSchema,
  ProcessResponse,
  processResponseSchema,
  processMediaSchema,
} from "../../src/domain/mediaProcessing";
import { ContentType } from "../../src/domain/models";
import { Actor, db, parse, requirePermission, writeAudit } from "./core";

// Doc 22 §A4 step 4 / doc 08 processMedia (EDITOR+). The admin web app calls
// this after uploading originals to their staging/ keys. ffmpeg needs a
// container, so the work runs on the Cloud Run media processor
// (services/media-processor); this callable checks the role and the DRAFT
// state, calls the processor with a Google OIDC identity token, and writes
// the returned variants onto content.media with an audit entry.

export type ProcessorClient = (
  request: ProcessRequest,
) => Promise<ProcessResponse>;

// A failure the processor reported (4xx/5xx with a JSON error body).
export class ProcessorCallError extends Error {
  override name = "ProcessorCallError";
  constructor(
    readonly status: number,
    readonly code: ProcessorErrorCode | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

// Identity token for `audience` from the metadata server of the function's
// runtime service account (Cloud Functions 2nd gen runs on Cloud Run).
export function metadataIdToken(audience: string, fetchImpl: Fetch = fetch) {
  return async () => {
    const url = new URL(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
    );
    url.searchParams.set("audience", audience);
    url.searchParams.set("format", "full");
    const response = await fetchImpl(url, {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!response.ok)
      throw new Error(`Identity token request failed (${response.status})`);
    return (await response.text()).trim();
  };
}

export function httpProcessorClient(options: {
  url: string;
  idToken: () => Promise<string>;
  fetchImpl?: Fetch;
  timeoutMs?: number;
}): ProcessorClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = new URL("/v1/process", options.url);
  return async (request) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await options.idToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs ?? 520_000),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: ProcessorErrorCode; message?: string };
    } | null;
    if (!response.ok)
      throw new ProcessorCallError(
        response.status,
        body?.error?.code ?? "UNKNOWN",
        body?.error?.message ?? `Processor returned ${response.status}`,
      );
    // Never trust the remote end blindly: same schema as the processor.
    const parsed = processResponseSchema.safeParse(body);
    if (!parsed.success)
      throw new ProcessorCallError(502, "UNKNOWN", "Malformed processor reply");
    return parsed.data;
  };
}

const loopback = (url: URL) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);

// Production: MEDIA_PROCESSOR_URL (the Cloud Run URL, HTTPS) and optionally
// MEDIA_PROCESSOR_AUDIENCE (defaults to the URL's origin). In the emulator,
// a loopback URL and MEDIA_PROCESSOR_DEV_TOKEN (no metadata server there).
export function processorClientFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: Fetch = fetch,
): ProcessorClient | null {
  if (!env.MEDIA_PROCESSOR_URL) return null;
  const url = new URL(env.MEDIA_PROCESSOR_URL);
  if (env.FUNCTIONS_EMULATOR === "true") {
    if (!loopback(url) || !env.MEDIA_PROCESSOR_DEV_TOKEN) return null;
    const token = env.MEDIA_PROCESSOR_DEV_TOKEN;
    return httpProcessorClient({
      url: url.href,
      idToken: async () => token,
      fetchImpl,
    });
  }
  if (url.protocol !== "https:") return null;
  return httpProcessorClient({
    url: url.href,
    idToken: metadataIdToken(
      env.MEDIA_PROCESSOR_AUDIENCE ?? url.origin,
      fetchImpl,
    ),
    fetchImpl,
  });
}

// Processor failures the operator can act on keep their message; the rest
// (auth misconfiguration, crashes, timeouts) are logged and reported
// generically.
function toHttpsError(error: unknown, contentId: string): HttpsError {
  if (error instanceof ProcessorCallError) {
    const visible: Partial<Record<string, FunctionsErrorCode>> = {
      INVALID_MEDIA: "failed-precondition",
      TOO_LARGE: "invalid-argument",
      NOT_FOUND: "not-found",
      INVALID_REQUEST: "invalid-argument",
    };
    const code = visible[error.code];
    if (code)
      return new HttpsError(code, error.message, { reason: error.code });
  }
  logger.error("Media processor call failed", {
    contentId,
    status: error instanceof ProcessorCallError ? error.status : undefined,
    code: error instanceof ProcessorCallError ? error.code : undefined,
    error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
  });
  return new HttpsError(
    "unavailable",
    "Media processing failed. Try again in a moment.",
  );
}

const keysOf = (media: Record<string, { key: string } | undefined>) =>
  Object.fromEntries(
    Object.entries(media)
      .filter(([, variant]) => variant)
      .map(([name, variant]) => [name, variant!.key])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const notDraft = (status: string) =>
  new HttpsError(
    "failed-precondition",
    `Content is ${status}. Move it back to DRAFT before replacing media.`,
  );

export async function processMedia(
  actor: Actor,
  data: unknown,
  deps: { processor?: ProcessorClient | null } = {},
) {
  requirePermission(actor, "content.upload");
  const input = parse(processMediaSchema, data);
  const processor =
    deps.processor === undefined
      ? processorClientFromEnv(process.env)
      : deps.processor;
  if (!processor)
    throw new HttpsError(
      "failed-precondition",
      "Media processing is not configured for this environment.",
    );
  const ref = db().collection("content").doc(input.contentId);
  const snapshot = await ref.get();
  if (!snapshot.exists)
    throw new HttpsError(
      "not-found",
      `Content "${input.contentId}" was not found.`,
    );
  const content = snapshot.data()!;
  if (!editableStatuses.includes(content.status))
    throw notDraft(content.status);

  const type: MediaType = mediaTypeForContent(content.type as ContentType);
  const request = parse(processRequestSchema, { ...input, type });
  let result: ProcessResponse;
  try {
    result = await processor(request);
  } catch (error) {
    throw toHttpsError(error, input.contentId);
  }
  // Variants must belong to this item (doc 22 §A2 key format).
  const prefix = `${type}/${input.contentId}/`;
  if (
    Object.values(result.media).some(
      (variant) => !variant?.key.startsWith(prefix),
    )
  )
    throw toHttpsError(
      new ProcessorCallError(502, "UNKNOWN", "Variant keys outside the item"),
      input.contentId,
    );

  // Processing takes a while: re-check DRAFT in the transaction that writes.
  return db().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists)
      throw new HttpsError(
        "not-found",
        `Content "${input.contentId}" was not found.`,
      );
    const stored = current.data()!;
    if (!editableStatuses.includes(stored.status))
      throw notDraft(stored.status);
    const before = (stored.media ?? {}) as Record<string, { key: string }>;
    // Replace the produced slots; keep the others (e.g. a separately uploaded thumb).
    const media = { ...before, ...result.media };
    const changed =
      JSON.stringify(keysOf(before)) !== JSON.stringify(keysOf(media)) ||
      (result.durationSeconds !== undefined &&
        stored.durationSeconds !== result.durationSeconds);
    const reply = {
      contentId: input.contentId,
      media,
      durationSeconds: result.durationSeconds ?? stored.durationSeconds ?? null,
      warnings: result.warnings ?? [],
      changed,
    };
    // A retried call that changes nothing writes nothing (and no audit entry).
    if (!changed) return reply;
    tx.update(ref, {
      media,
      ...(result.durationSeconds === undefined
        ? {}
        : { durationSeconds: result.durationSeconds }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, actor, {
      action: "media.process",
      entity: "content",
      entityId: input.contentId,
      // Replaced keys are kept for the 30-day cleanup (doc 09 §5).
      beforeSummary: { media: keysOf(before) },
      afterSummary: {
        media: keysOf(result.media),
        inputs: request.inputs,
        durationSeconds: result.durationSeconds ?? null,
      },
    });
    return reply;
  });
}
