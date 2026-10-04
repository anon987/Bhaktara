import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, initializeAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from "firebase/firestore";
import { BackendConfig } from "../backend/config";
import { createSessionService } from "../auth/session";
import { authPersistence } from "./persistence";

type FirebaseConfig = Exclude<BackendConfig, { mode: "fixture" }>;

export function createFirebaseClient(config: FirebaseConfig) {
  const name =
    config.mode === "emulator"
      ? `bhaktara-emulator-${config.host}`
      : `bhaktara-${config.firebase.projectId}`;
  const existing = getApps().find((value) => value.name === name);
  const app =
    existing ??
    initializeApp(
      config.mode === "emulator"
        ? {
            projectId: config.projectId,
            apiKey: "demo-api-key",
            appId: "demo-bhaktara-app",
          }
        : config.firebase,
      name,
    );
  const auth = existing
    ? getAuth(app)
    : initializeAuth(app, { persistence: authPersistence });
  // Long polling avoids WebChannel streaming issues in React Native.
  const db = existing
    ? getFirestore(app)
    : initializeFirestore(app, { experimentalForceLongPolling: true });
  if (!existing && config.mode === "emulator") {
    connectAuthEmulator(auth, `http://${config.host}:9099`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, config.host, 8080);
  }
  const session = createSessionService({
    ready: () => auth.authStateReady(),
    current: () =>
      auth.currentUser && {
        uid: auth.currentUser.uid,
        isAnonymous: auth.currentUser.isAnonymous,
      },
    async createAnonymous() {
      const { signInAnonymously } = await import("firebase/auth");
      const { user } = await signInAnonymously(auth);
      return { uid: user.uid, isAnonymous: user.isAnonymous };
    },
  });
  return { db, session };
}
