import { z } from "zod";

export type BackendConfig =
  | { mode: "fixture" }
  | { mode: "emulator"; projectId: "demo-bhaktara"; host: string };

// Emulator mode deliberately has no cloud fallback or production credentials.
export function parseBackendConfig(
  mode?: string,
  host?: string,
): BackendConfig {
  if (!mode || mode === "fixture") return { mode: "fixture" };
  if (mode !== "emulator") throw new Error("Unsupported backend mode");
  const address = z
    .string()
    .regex(/^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/)
    .parse(host || "127.0.0.1");
  return { mode: "emulator", projectId: "demo-bhaktara", host: address };
}

export function readBackendConfig(): BackendConfig {
  return parseBackendConfig(
    process.env.EXPO_PUBLIC_BACKEND_MODE,
    process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
  );
}
