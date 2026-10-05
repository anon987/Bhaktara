// Runtime configuration for the admin app. Two modes:
//
// - Emulator (default): talks to `npm run emulators:cms` on 127.0.0.1 with a
//   `demo-*` project ID, which the Firebase SDKs can never route to a real
//   project.
// - Project: VITE_USE_EMULATORS=false plus the web app config of a real
//   Firebase project (put it in admin/.env.production.local, which Git
//   ignores). This is the production seam; nothing here is a secret, but
//   real values stay out of the repo anyway.

export type AdminConfig = {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId?: string;
  };
  emulators: {
    host: string;
    authPort: number;
    firestorePort: number;
    functionsPort: number;
  } | null;
  // Cloud Functions region (functions/src/index.ts setGlobalOptions).
  functionsRegion: string;
};

type Env = Record<string, string | boolean | undefined>;

const text = (env: Env, key: string) => {
  const value = env[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
};

const port = (env: Env, key: string, fallback: number) => {
  const value = text(env, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535)
    throw new Error(`${key} must be a port number.`);
  return parsed;
};

export function readConfig(env: Env): AdminConfig {
  const useEmulators = text(env, "VITE_USE_EMULATORS") !== "false";
  const functionsRegion = text(env, "VITE_FUNCTIONS_REGION") ?? "asia-south1";
  if (useEmulators) {
    const projectId = text(env, "VITE_FIREBASE_PROJECT_ID") ?? "demo-bhaktara";
    if (!projectId.startsWith("demo-"))
      throw new Error(
        "Emulator mode needs a demo-* project ID so nothing can reach a real project.",
      );
    return {
      firebase: {
        apiKey: "demo-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
      emulators: {
        host: text(env, "VITE_EMULATOR_HOST") ?? "127.0.0.1",
        authPort: port(env, "VITE_AUTH_EMULATOR_PORT", 9099),
        firestorePort: port(env, "VITE_FIRESTORE_EMULATOR_PORT", 8080),
        functionsPort: port(env, "VITE_FUNCTIONS_EMULATOR_PORT", 5001),
      },
      functionsRegion,
    };
  }
  const required = {
    apiKey: text(env, "VITE_FIREBASE_API_KEY"),
    authDomain: text(env, "VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: text(env, "VITE_FIREBASE_PROJECT_ID"),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length)
    throw new Error(
      `VITE_USE_EMULATORS=false needs the Firebase web config (${missing.join(", ")}).`,
    );
  if (required.projectId!.startsWith("demo-"))
    throw new Error("demo-* projects only exist in the emulators.");
  return {
    firebase: {
      apiKey: required.apiKey!,
      authDomain: required.authDomain!,
      projectId: required.projectId!,
      appId: text(env, "VITE_FIREBASE_APP_ID"),
    },
    emulators: null,
    functionsRegion,
  };
}

export const describeEnvironment = (config: AdminConfig) =>
  config.emulators
    ? `Emulators · ${config.firebase.projectId}`
    : config.firebase.projectId;
