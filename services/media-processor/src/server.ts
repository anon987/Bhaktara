import { createServer, IncomingMessage, ServerResponse } from "node:http";
import {
  ProcessorErrorCode,
  ProcessRequest,
  processRequestSchema,
  ProcessResponse,
} from "../../../src/domain/mediaProcessing";
import { AuthError, Verifier } from "./auth";
import { ProcessDeps, ProcessorError, processUpload } from "./processor";

// HTTP surface (Cloud Run): POST /v1/process with a JSON ProcessRequest and
// a Google OIDC bearer token; GET /healthz for local checks.
export const MAX_BODY_BYTES = 16 * 1024;

export type ServerDeps = ProcessDeps & {
  verify: Verifier;
  // Injectable for tests; defaults to the real pipeline.
  process?: (
    request: ProcessRequest,
    deps: ProcessDeps,
  ) => Promise<ProcessResponse>;
};

type ErrorBody = {
  error: {
    code: ProcessorErrorCode;
    message: string;
    issues?: { path: string; message: string }[];
  };
};

function send(
  response: ServerResponse,
  status: number,
  body: ProcessResponse | ErrorBody | { ok: true },
) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

const fail = (
  response: ServerResponse,
  status: number,
  code: ProcessorErrorCode,
  message: string,
  issues?: ErrorBody["error"]["issues"],
) => send(response, status, { error: { code, message, issues } });

async function readBody(request: IncomingMessage): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createProcessorServer(deps: ServerDeps) {
  const run = deps.process ?? processUpload;
  return createServer(async (request, response) => {
    const started = Date.now();
    const path = (request.url ?? "/").split("?")[0];
    try {
      if (path === "/healthz" && request.method === "GET")
        return send(response, 200, { ok: true });
      if (path !== "/v1/process")
        return fail(response, 404, "NOT_FOUND", "Unknown route.");
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return fail(response, 405, "INVALID_REQUEST", "Use POST.");
      }

      const caller = await deps.verify(request.headers.authorization);

      if (!/^application\/json\b/i.test(request.headers["content-type"] ?? ""))
        return fail(response, 415, "INVALID_REQUEST", "Send JSON.");
      const text = await readBody(request);
      if (text === null)
        return fail(response, 413, "TOO_LARGE", "The request is too large.");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return fail(response, 400, "INVALID_REQUEST", "The body is not JSON.");
      }
      const parsed = processRequestSchema.safeParse(json);
      if (!parsed.success)
        return fail(
          response,
          400,
          "INVALID_REQUEST",
          "Some fields are invalid.",
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );

      const result = await run(parsed.data, deps);
      deps.log.info("Processed media", {
        contentId: parsed.data.contentId,
        type: parsed.data.type,
        caller: caller.email,
        variants: Object.keys(result.media).sort().join(","),
        ms: Date.now() - started,
      });
      return send(response, 200, result);
    } catch (error) {
      if (error instanceof AuthError) {
        deps.log.warn("Rejected caller", { status: error.status, path });
        return fail(
          response,
          error.status,
          error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
          error.message,
        );
      }
      if (error instanceof ProcessorError) {
        deps.log.warn("Request refused", {
          status: error.status,
          code: error.code,
          message: error.message,
        });
        return fail(response, error.status, error.code, error.message);
      }
      // Internal detail (ffmpeg stderr, storage errors) stays in the logs.
      deps.log.error("Processing failed", {
        error: error instanceof Error ? error.name : "unknown",
        detail:
          error instanceof Error ? error.message.slice(0, 2000) : undefined,
        ms: Date.now() - started,
      });
      if (!response.headersSent)
        fail(response, 500, "INTERNAL", "Processing failed.");
    }
  });
}
