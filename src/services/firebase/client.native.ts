import {
  FirebaseApp,
  getApp,
  getApps,
  initializeApp,
} from "@react-native-firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "@react-native-firebase/auth";
import * as nativeFirestore from "@react-native-firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { createSessionService } from "../auth/session";
import { createFirestoreRepository } from "../../repositories/firestoreRepository";
import { createFirestoreFavoritesRepository } from "../../repositories/favoritesRepository";
import { FirestoreApi } from "../../repositories/firestoreApi";
import { startAppCheck } from "./appCheck";
import type { FirebaseConfig } from "./client";

// React Native Firebase exports the same modular Firestore functions as the
// JavaScript SDK; only their declared types differ.
const firestoreApi = nativeFirestore as unknown as FirestoreApi;
const emulatorAppName = "bhaktara-emulator";

// Android/iOS: React Native Firebase (native SDKs, native offline cache).
export async function createFirebaseClient(config: FirebaseConfig) {
  let app: FirebaseApp;
  if (config.mode === "emulator") {
    // A separate app keeps the emulator's demo project apart from the real
    // project configured by google-services.json.
    app =
      getApps().find((value) => value.name === emulatorAppName) ??
      (await initializeApp(
        {
          apiKey: "demo-api-key",
          appId: "1:000000000000:android:0000000000000000",
          projectId: config.projectId,
          messagingSenderId: "000000000000",
          databaseURL: "",
          storageBucket: "",
        },
        emulatorAppName,
      ));
  } else {
    app = getApp();
    // The native project comes from google-services.json; refuse to run if it
    // disagrees with the configured environment.
    if (app.options.projectId !== config.firebase.projectId)
      throw new Error(
        `Native Firebase project ${app.options.projectId} does not match ${config.firebase.projectId}`,
      );
    // App Check must attach before the first Auth or Firestore request.
    startAppCheck(app);
  }
  const auth = getAuth(app);
  const db = nativeFirestore.getFirestore(app);
  if (config.mode === "emulator") {
    connectAuthEmulator(auth, `http://${config.host}:9099`);
    nativeFirestore.connectFirestoreEmulator(db, config.host, 8080);
  }
  let restored: Promise<void> | null = null;
  const session = createSessionService({
    // The first auth-state event means the persisted session (if any) is restored.
    ready: () =>
      (restored ??= new Promise<void>((resolve) => {
        let fired = false;
        const unsubscribe = onAuthStateChanged(auth, () => {
          if (fired) return;
          fired = true;
          resolve();
          // Deferred: the listener may fire before onAuthStateChanged returns.
          queueMicrotask(() => unsubscribe());
        });
      })),
    current: () =>
      auth.currentUser && {
        uid: auth.currentUser.uid,
        isAnonymous: auth.currentUser.isAnonymous,
      },
    async createAnonymous() {
      const { user } = await signInAnonymously(auth);
      return { uid: user.uid, isAnonymous: user.isAnonymous };
    },
  });
  const firestore = db as unknown as Firestore;
  return {
    session,
    content: createFirestoreRepository(firestore, session, firestoreApi),
    favorites: createFirestoreFavoritesRepository(
      firestore,
      session,
      firestoreApi,
    ),
  };
}
