import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
export const projectId = "demo-bhaktara";
export async function emulatorEnvironment() {
  // Never accept arbitrary hosts or cloud credentials in the seed/test pipeline.
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST must be 127.0.0.1:8080; run the local emulators first.",
    );
  }
  return initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080 },
  });
}
