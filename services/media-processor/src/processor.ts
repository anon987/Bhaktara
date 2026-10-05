import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MediaInputRole,
  mediaInputRoles,
  ProcessorErrorCode,
  ProcessRequest,
  ProcessResponse,
  processResponseSchema,
  stagingMaxBytes,
} from "../../../src/domain/mediaProcessing";
import {
  Inputs,
  MediaValidationError,
  probe,
  Probe,
} from "../../../scripts/media/process";
import { publishMedia, Uploader } from "../../../scripts/media/publish";
import { ObjectTooLargeError } from "../../../scripts/media/r2";
import { Logger } from "./log";
import { MediaStore } from "./store";

// Doc 22 §A4 step 4 on Cloud Run: fetch the staging originals, validate them,
// render the doc 22 §A3 variants with the shared pipeline (scripts/media),
// upload them under content-addressed keys, then delete the staging files.

export class ProcessorError extends Error {
  override name = "ProcessorError";
  constructor(
    readonly status: number,
    readonly code: ProcessorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Input limits beyond the per-type rules in process.ts (doc 12 §6). They stop
// pathological files before ffmpeg spends minutes on them.
export const defaultLimits = {
  maxAudioSeconds: 2 * 60 * 60,
  maxVideoSeconds: 120,
  maxImageSide: 12_000,
  maxVideoSide: 4096,
};
export type Limits = typeof defaultLimits;

export type ProcessDeps = {
  store: MediaStore;
  log: Logger;
  limits?: Limits;
  // Where originals are downloaded (Cloud Run: the in-memory /tmp).
  workRoot?: string;
};

// Retries of the same request find this receipt and get the same answer,
// even after the staging originals were deleted. It lives under the staging
// prefix, so the bucket's staging lifecycle rule also expires it.
export function receiptKey(request: ProcessRequest): string {
  const identity = JSON.stringify([
    request.contentId,
    request.type,
    mediaInputRoles.map((role) => request.inputs[role] ?? null),
  ]);
  const hash = createHash("sha256").update(identity).digest("hex");
  return `staging/${request.contentId}/receipts/${hash.slice(0, 32)}.json`;
}

const invalid = (message: string) =>
  new ProcessorError(422, "INVALID_MEDIA", message);

export function checkInput(role: MediaInputRole, info: Probe, limits: Limits) {
  const { width = 0, height = 0, durationSeconds = 0 } = info;
  switch (role) {
    case "audio":
      if (!info.hasAudio || !durationSeconds)
        throw invalid("The audio file has no playable audio.");
      if (durationSeconds > limits.maxAudioSeconds)
        throw invalid(
          `Audio is ${durationSeconds} s; the limit is ${limits.maxAudioSeconds} s.`,
        );
      return;
    case "image":
      if (!info.hasVideo || !info.still || !width || !height)
        throw invalid("The image file is not a still image.");
      if (width > limits.maxImageSide || height > limits.maxImageSide)
        throw invalid(
          `Image is ${width}×${height}; the limit is ${limits.maxImageSide} px per side.`,
        );
      return;
    case "video":
      if (!info.hasVideo || info.still || !durationSeconds)
        throw invalid("The video file has no playable video.");
      if (durationSeconds > limits.maxVideoSeconds)
        throw invalid(
          `Video is ${durationSeconds} s; the limit is ${limits.maxVideoSeconds} s.`,
        );
      if (width > limits.maxVideoSide || height > limits.maxVideoSide)
        throw invalid(
          `Video is ${width}×${height}; the limit is ${limits.maxVideoSide} px per side.`,
        );
      return;
  }
}

const asUploader =
  (store: MediaStore): Uploader =>
  async (key, _path, body, mime) =>
    (await store.putImmutable(key, body, mime)) === "exists"
      ? "unchanged"
      : "uploaded";

// Staging deletion is best-effort: the variants and receipt are already
// stored, and the staging lifecycle rule removes anything left behind.
async function removeStaging(request: ProcessRequest, deps: ProcessDeps) {
  for (const role of mediaInputRoles) {
    const key = request.inputs[role];
    if (!key) continue;
    try {
      await deps.store.remove(key);
    } catch (error) {
      deps.log.warn("Staging delete failed", {
        contentId: request.contentId,
        key,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

export async function processUpload(
  request: ProcessRequest,
  deps: ProcessDeps,
): Promise<ProcessResponse> {
  const limits = deps.limits ?? defaultLimits;
  const receipt = receiptKey(request);
  const previous = processResponseSchema.safeParse(
    await deps.store.getJson(receipt),
  );
  if (previous.success) {
    await removeStaging(request, deps);
    deps.log.info("Returning stored result", {
      contentId: request.contentId,
      type: request.type,
    });
    return previous.data;
  }

  const work = await mkdtemp(join(deps.workRoot ?? tmpdir(), "processor-"));
  try {
    const inputs: Inputs = {};
    for (const role of mediaInputRoles) {
      const key = request.inputs[role];
      if (!key) continue;
      const maxBytes = stagingMaxBytes(key);
      const path = join(
        work,
        `input-${role}${key.slice(key.lastIndexOf("."))}`,
      );
      let bytes: number | null;
      try {
        bytes = await deps.store.download(key, path, maxBytes);
      } catch (error) {
        if (error instanceof ObjectTooLargeError)
          throw new ProcessorError(
            413,
            "TOO_LARGE",
            `The ${role} file is larger than ${Math.round(maxBytes / 1048576)} MB.`,
          );
        throw error;
      }
      if (bytes === null)
        throw new ProcessorError(
          404,
          "NOT_FOUND",
          `The uploaded ${role} file was not found. Upload it again.`,
        );
      let info: Probe;
      try {
        info = await probe(path);
      } catch {
        throw invalid(`The ${role} file could not be read.`);
      }
      checkInput(role, info, limits);
      inputs[role] = path;
    }

    let media;
    const warnings: string[] = [];
    try {
      media = await publishMedia({
        type: request.type,
        id: request.contentId,
        inputs,
        upload: asUploader(deps.store),
        warn: (warning) => {
          warnings.push(warning);
          deps.log.warn("Media warning", {
            contentId: request.contentId,
            warning,
          });
        },
      });
    } catch (error) {
      if (error instanceof MediaValidationError) throw invalid(error.message);
      throw error;
    }
    const durationSeconds =
      media.stream?.durationSeconds ??
      media.file?.durationSeconds ??
      media.video720?.durationSeconds;
    const response = processResponseSchema.parse({
      media,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      ...(warnings.length ? { warnings } : {}),
    });
    await deps.store.putJson(receipt, response);
    await removeStaging(request, deps);
    return response;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
