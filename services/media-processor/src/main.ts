import { r2Bucket, r2ConfigFromEnv } from "../../../scripts/media/r2";
import { googleOidcVerifier, staticTokenVerifier, Verifier } from "./auth";
import { jsonLogger, Logger } from "./log";
import { createProcessorServer } from "./server";
import { fsStore, MediaStore, r2Store } from "./store";

// Configuration (names only are ever logged, never values):
//   Cloud Run: R2_ACCOUNT_ID, R2_BUCKET (env), R2_ACCESS_KEY_ID,
//     R2_SECRET_ACCESS_KEY (Secret Manager), PROCESSOR_AUDIENCE (this
//     service's URL), INVOKER_SERVICE_ACCOUNT (the functions runtime SA).
//   Local: MEDIA_STORE_DIR (a directory standing in for the bucket) and
//     LOCAL_DEV_TOKEN (shared bearer token). Refused on Cloud Run.
export type ProcessorConfig = { store: MediaStore; verify: Verifier };

export function configFromEnv(env: NodeJS.ProcessEnv): ProcessorConfig {
  const onCloudRun = !!env.K_SERVICE;
  if (env.LOCAL_DEV_TOKEN || env.MEDIA_STORE_DIR) {
    if (onCloudRun || env.R2_ACCESS_KEY_ID || env.R2_SECRET_ACCESS_KEY)
      throw new Error(
        "LOCAL_DEV_TOKEN/MEDIA_STORE_DIR are for local runs only; unset them (or the R2 credentials).",
      );
    if (!env.LOCAL_DEV_TOKEN || !env.MEDIA_STORE_DIR)
      throw new Error(
        "Local mode needs both MEDIA_STORE_DIR and LOCAL_DEV_TOKEN.",
      );
    if (env.LOCAL_DEV_TOKEN.length < 16)
      throw new Error("LOCAL_DEV_TOKEN must be at least 16 characters.");
    return {
      store: fsStore(env.MEDIA_STORE_DIR),
      verify: staticTokenVerifier(env.LOCAL_DEV_TOKEN),
    };
  }
  const r2 = r2ConfigFromEnv(env);
  const missing = [
    ...("missing" in r2 ? r2.missing : []),
    ...(["PROCESSOR_AUDIENCE", "INVOKER_SERVICE_ACCOUNT"] as const).filter(
      (name) => !env[name],
    ),
  ];
  if ("missing" in r2 || missing.length)
    throw new Error(`Missing configuration: ${missing.join(", ")}.`);
  return {
    store: r2Store(r2Bucket(r2.config)),
    verify: googleOidcVerifier({
      audience: env.PROCESSOR_AUDIENCE!,
      serviceAccount: env.INVOKER_SERVICE_ACCOUNT!,
    }),
  };
}

export function start(env = process.env, log: Logger = jsonLogger) {
  const config = configFromEnv(env);
  const port = Number(env.PORT ?? 8080);
  const host = env.K_SERVICE ? "0.0.0.0" : (env.HOST ?? "127.0.0.1");
  const server = createProcessorServer({ ...config, log });
  // Processing can take minutes; Cloud Run enforces the request timeout.
  server.requestTimeout = 0;
  server.listen(port, host, () =>
    log.info("Media processor listening", {
      port,
      store: config.store.label,
    }),
  );
  process.once("SIGTERM", () => server.close());
  return server;
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    jsonLogger.error("Media processor failed to start", {
      error: error instanceof Error ? error.message : "unknown",
    });
    process.exitCode = 1;
  }
}
