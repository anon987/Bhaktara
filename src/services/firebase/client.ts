import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getIdToken,
  GoogleAuthProvider,
  initializeAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { BackendConfig } from "../backend/config";
import { createSessionService } from "../auth/session";
import { createFirestoreRepository } from "../../repositories/firestoreRepository";
import { createFirestoreFavoritesRepository } from "../../repositories/favoritesRepository";
import {
  Callable,
  createProgressionRepository,
} from "../../repositories/progressionRepository";
import { createAccountRepository } from "../../repositories/accountRepository";
import { createGoogleSignIn } from "../account/googleSignIn";
import { readStoredProfile } from "../account/profileStore";
import { authPersistence } from "./persistence";
import { jsFirestoreApi } from "./jsFirestoreApi";

export type FirebaseConfig = Exclude<BackendConfig, { mode: "fixture" }>;

// Web build: the Firebase JavaScript SDK. Android/iOS use client.native.ts.
export async function createFirebaseClient(config: FirebaseConfig) {
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
  const db = existing ? getFirestore(app) : initializeFirestore(app, {});
  const functions = getFunctions(app, "asia-south1");
  if (!existing && config.mode === "emulator") {
    connectAuthEmulator(auth, `http://${config.host}:9099`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, config.host, 8080);
    connectFunctionsEmulator(functions, config.host, 5001);
  }
  const call: Callable = async (name, data) =>
    (await httpsCallable(functions, name, { timeout: 20_000 })(data))
      .data as never;
  const session = createSessionService({
    ready: () => auth.authStateReady(),
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
  const user = () => {
    if (!auth.currentUser) throw new Error("No session");
    return auth.currentUser;
  };
  return {
    session,
    account: {
      callables: createAccountRepository(call),
      google: createGoogleSignIn(),
      auth: {
        current: () =>
          auth.currentUser && {
            uid: auth.currentUser.uid,
            isAnonymous: auth.currentUser.isAnonymous,
            providerName: auth.currentUser.displayName,
            email: auth.currentUser.email,
          },
        getIdToken: () => getIdToken(user()),
        async linkGoogle(idToken: string) {
          await linkWithCredential(
            user(),
            GoogleAuthProvider.credential(idToken),
          );
        },
        async signInGoogle(idToken: string) {
          await signInWithCredential(
            auth,
            GoogleAuthProvider.credential(idToken),
          );
        },
        signOut: () => signOut(auth),
        async signInAnonymously() {
          await signInAnonymously(auth);
        },
        readProfile: async (uid: string) =>
          readStoredProfile(
            (
              await jsFirestoreApi.getDocFromServer(
                jsFirestoreApi.doc(db, "users", uid),
              )
            ).data(),
          ),
      },
    },
    content: createFirestoreRepository(db, session, jsFirestoreApi),
    favorites: createFirestoreFavoritesRepository(db, session, jsFirestoreApi),
    progression: createProgressionRepository(db, session, jsFirestoreApi, call),
  };
}
