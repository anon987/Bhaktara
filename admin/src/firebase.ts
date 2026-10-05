import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import type { AdminConfig } from "./config";

export function createFirebase(config: AdminConfig) {
  const app = initializeApp(config.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, config.functionsRegion);
  if (config.emulators) {
    const { host, authPort, firestorePort, functionsPort } = config.emulators;
    connectAuthEmulator(auth, `http://${host}:${authPort}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, host, firestorePort);
    connectFunctionsEmulator(functions, host, functionsPort);
  }
  return { app, auth, db, functions };
}

export type FirebaseServices = ReturnType<typeof createFirebase>;
