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

export function createFirebaseClient(
  config: Extract<BackendConfig, { mode: "emulator" }>,
) {
  const name = `bhaktara-${config.mode}-${config.host}`;
  const existing = getApps().find((value) => value.name === name);
  const app =
    existing ??
    initializeApp(
      {
        projectId: config.projectId,
        apiKey: "demo-api-key",
        appId: "demo-bhaktara-app",
      },
      name,
    );
  const auth = existing
    ? getAuth(app)
    : initializeAuth(app, { persistence: authPersistence });
  const db = existing
    ? getFirestore(app)
    : initializeFirestore(app, { experimentalForceLongPolling: true });
  if (!existing) {
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
