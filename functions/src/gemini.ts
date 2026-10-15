import { createSign } from "node:crypto";
import { logger } from "firebase-functions";

// Gemini on Vertex AI, signed in as a service account (OAuth 2.0 JWT bearer
// grant), so no API key is involved. The four credentials come from Secret
// Manager in deployed environments (bound in index.ts when
// GEMINI_SECRETS=true) and from functions/.env.local in the emulator; the
// model is the plain env var GEMINI_MODEL. The key, the token and the
// model's replies are never logged or returned; each call logs its token
// usage so the cost can be checked. Every HTTP call goes through an
// injectable fetch, so tests stay offline.

// Gemini 2.5 Flash retires on Vertex in October 2026.
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export type GeminiConfig = {
  project: string;
  clientEmail: string;
  keyId: string;
  privateKey: string;
  model: string;
};

export function geminiConfigFromEnv(env: NodeJS.ProcessEnv): GeminiConfig | null {
  const credentials = {
    project: env.GEMINI_PROJECT?.trim(),
    clientEmail: env.GEMINI_SA_EMAIL?.trim(),
    keyId: env.GEMINI_SA_KEY_ID?.trim(),
    // .env files and secrets copied from the JSON key keep "\n" escaped.
    privateKey: env.GEMINI_SA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim(),
  };
  if (!Object.values(credentials).every(Boolean)) return null;
  return {
    ...(credentials as Omit<GeminiConfig, "model">),
    model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  };
}

type Fetch = typeof fetch;
type Clock = () => number;

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const generateContentUrl = (project: string, model: string) =>
  `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

// A self-signed RS256 assertion for the OAuth 2.0 JWT bearer grant.
export function serviceAccountJwt(
  config: Pick<GeminiConfig, "clientEmail" | "keyId" | "privateKey">,
  nowSeconds: number,
) {
  const header = { alg: "RS256", typ: "JWT", kid: config.keyId };
  const claims = {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(config.privateKey);
  return `${unsigned}.${base64url(signature)}`;
}

// Errors from Google whose details must not reach the client or the logs.
export class GeminiCallError extends Error {
  override name = "GeminiCallError";
  constructor(
    readonly step: "token" | "generate",
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Gemini ${step} request failed (${status} ${reason})`);
  }
}

// Google's error bodies carry a short status such as PERMISSION_DENIED; the
// message is only inspected (for the thinking fallback), never kept.
const errorOf = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { status?: string; message?: string };
  } | null;
  const error = body?.error;
  return {
    reason: (typeof error === "string" ? error : error?.status) ?? "UNKNOWN",
    aboutThinking:
      typeof error === "object" && /thinking/i.test(error?.message ?? ""),
  };
};

// Access tokens live an hour; one is reused until a minute before it
// expires, and concurrent calls share the request in flight.
const REFRESH_MARGIN_MS = 60_000;
export function serviceAccountToken(
  config: Pick<GeminiConfig, "clientEmail" | "keyId" | "privateKey">,
  options: { fetchImpl?: Fetch; now?: Clock } = {},
): () => Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cached: { token: Promise<string>; expiresAt: number } | null = null;
  const request = async (issuedAt: number) => {
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountJwt(config, Math.floor(issuedAt / 1000)),
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new GeminiCallError("token", response.status, (await errorOf(response)).reason);
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token)
      throw new GeminiCallError("token", response.status, "NO_ACCESS_TOKEN");
    return { token: body.access_token, expiresIn: body.expires_in ?? 3600 };
  };
  return () => {
    const at = now();
    if (cached && at < cached.expiresAt) return cached.token;
    // Until the reply arrives, callers share this request; a failed one is
    // forgotten so the next call tries again.
    const entry = { token: Promise.resolve(""), expiresAt: Infinity };
    entry.token = request(at).then(({ token, expiresIn }) => {
      entry.expiresAt = at + expiresIn * 1000 - REFRESH_MARGIN_MS;
      return token;
    });
    entry.token.catch(() => {
      if (cached === entry) cached = null;
    });
    cached = entry;
    return entry.token;
  };
}

export type GeminiRequest = {
  prompt: string;
  responseSchema: Record<string, unknown>;
  // Defaults to 50 s, within the callable's own timeout.
  timeoutMs?: number;
  // A ceiling on billed output; unset leaves the model's default.
  maxOutputTokens?: number;
  // Added to the usage log line (counts and IDs only, never text).
  logContext?: Record<string, unknown>;
  // Told the token usage of the call, including a cut-off one.
  onUsage?: (usage: GeminiUsage) => void;
};
export type GeminiUsage = {
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: number | null;
  finishReason: string | null;
};
// Returns the model's JSON text (candidates[0].content.parts[0].text).
export type Gemini = (request: GeminiRequest) => Promise<string>;

type GenerateResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

export function vertexGemini(
  config: GeminiConfig,
  options: { fetchImpl?: Fetch; token?: () => Promise<string> } = {},
): Gemini {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.token ?? serviceAccountToken(config, { fetchImpl });
  // Thinking is kept minimal to save output tokens. A model that rejects the
  // setting is asked again without it, and not offered it again.
  let thinking = true;
  const post = async (request: GeminiRequest, withThinking: boolean) =>
    fetchImpl(generateContentUrl(config.project, config.model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: request.responseSchema,
          temperature: 0.2,
          ...(request.maxOutputTokens
            ? { maxOutputTokens: request.maxOutputTokens }
            : {}),
          ...(withThinking ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
        },
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? 50_000),
    });
  return async (request) => {
    let response = await post(request, thinking);
    if (!response.ok && response.status === 400 && thinking) {
      const error = await errorOf(response);
      if (!error.aboutThinking)
        throw new GeminiCallError("generate", response.status, error.reason);
      logger.warn("Gemini model rejected thinkingConfig; retrying without it", {
        model: config.model,
      });
      thinking = false;
      response = await post(request, false);
    }
    if (!response.ok)
      throw new GeminiCallError("generate", response.status, (await errorOf(response)).reason);
    const body = (await response.json().catch(() => null)) as GenerateResponse | null;
    const usage = body?.usageMetadata ?? {};
    const candidate = body?.candidates?.[0];
    const counts: GeminiUsage = {
      promptTokenCount: usage.promptTokenCount ?? null,
      candidatesTokenCount: usage.candidatesTokenCount ?? null,
      thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
      finishReason: candidate?.finishReason ?? null,
    };
    logger.info("Gemini usage", { ...request.logContext, model: config.model, ...counts });
    request.onUsage?.(counts);
    if (candidate?.finishReason === "MAX_TOKENS")
      throw new GeminiCallError("generate", response.status, "MAX_TOKENS");
    // Thought summaries (if any) are skipped; the answer is the text part.
    const text = candidate?.content?.parts?.find((part) => !part.thought)?.text;
    if (typeof text !== "string")
      throw new GeminiCallError("generate", response.status, "NO_TEXT");
    return text;
  };
}

// One client per model and service account key for the life of the
// instance, so warm instances reuse the access token and what was learnt
// about thinking support.
const clients = new Map<string, Gemini>();
export function geminiFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: Fetch = fetch,
): Gemini | null {
  const config = geminiConfigFromEnv(env);
  if (!config) return null;
  const id = [config.project, config.model, config.clientEmail, config.keyId].join("|");
  let client = clients.get(id);
  if (!client) {
    client = vertexGemini(config, { fetchImpl });
    clients.set(id, client);
  }
  return client;
}
