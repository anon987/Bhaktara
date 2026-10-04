import { z } from "zod";

export type FirebaseWebConfig = {
  apiKey: string;
  appId: string;
  projectId: string;
  authDomain: string;
  messagingSenderId?: string;
};
export type BackendConfig =
  | { mode: "fixture" }
  | { mode: "emulator"; projectId: "demo-bhaktara"; host: string }
  | { mode: "cloud"; firebase: FirebaseWebConfig };

export type BackendEnv = {
  mode?: string;
  emulatorHost?: string;
  apiKey?: string;
  appId?: string;
  projectId?: string;
  authDomain?: string;
  messagingSenderId?: string;
};

// Web-app config identifies the project; access is enforced by security rules.
// Only Bhaktara's own environments are accepted (doc 23 §2).
const cloudSchema = z.object({
  apiKey: z
    .string()
    .regex(/^AIza[0-9A-Za-z_-]{35}$/, "invalid Firebase API key"),
  appId: z
    .string()
    .regex(/^1:\d+:web:[0-9a-f]+$/, "use the Firebase Web app ID"),
  projectId: z.enum(["bhaktara-dev", "bhaktara-staging", "bhaktara-prod"]),
  authDomain: z
    .string()
    .regex(/^[a-z0-9-]+\.(firebaseapp\.com|web\.app)$/)
    .optional(),
  messagingSenderId: z.string().regex(/^\d+$/).optional(),
});

// Emulator mode deliberately has no cloud fallback or production credentials;
// cloud mode must be chosen explicitly with a complete config.
export function parseBackendConfig(env: BackendEnv = {}): BackendConfig {
  const mode = env.mode;
  if (!mode || mode === "fixture") return { mode: "fixture" };
  if (mode === "emulator") {
    const address = z
      .string()
      .regex(/^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/)
      .parse(env.emulatorHost || "127.0.0.1");
    return { mode: "emulator", projectId: "demo-bhaktara", host: address };
  }
  if (mode !== "cloud") throw new Error("Unsupported backend mode");
  const config = cloudSchema.parse({
    apiKey: env.apiKey,
    appId: env.appId,
    projectId: env.projectId,
    authDomain: env.authDomain || undefined,
    messagingSenderId: env.messagingSenderId || undefined,
  });
  return {
    mode: "cloud",
    firebase: {
      ...config,
      authDomain: config.authDomain ?? `${config.projectId}.firebaseapp.com`,
    },
  };
}

// Expo inlines EXPO_PUBLIC_* only for literal property accesses, so each
// variable is read by name rather than through a dynamic lookup.
export function readBackendConfig(): BackendConfig {
  return parseBackendConfig({
    mode: process.env.EXPO_PUBLIC_BACKEND_MODE,
    emulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  });
}
