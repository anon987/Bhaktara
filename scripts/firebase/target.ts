import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { projectId as emulatorProjectId } from "../emulator/environment";

// Where operator scripts write. The emulator is the default; real projects
// must be named, and anything other than dev must be confirmed (doc 23 §1).
export type FirestoreTarget =
  { kind: "emulator" } | { kind: "project"; projectId: string };
const projects: Record<string, string> = {
  dev: "bhaktara-dev",
  staging: "bhaktara-staging",
  prod: "bhaktara-prod",
};

export function resolveTarget(
  project?: string,
  confirmProject?: string,
): FirestoreTarget {
  if (!project || project === "emulator" || project === emulatorProjectId)
    return { kind: "emulator" };
  const projectId = projects[project] ?? project;
  if (!Object.values(projects).includes(projectId))
    throw new Error(
      `Unknown project "${project}"; use dev, staging, prod or emulator`,
    );
  if (projectId !== "bhaktara-dev" && confirmProject !== projectId)
    throw new Error(
      `Refusing to write to ${projectId} without --confirm-project ${projectId}`,
    );
  return { kind: "project", projectId };
}

export const describeTarget = (target: FirestoreTarget) =>
  target.kind === "emulator" ? "local emulator" : target.projectId;

// Admin SDK for both targets: the emulator through FIRESTORE_EMULATOR_HOST,
// real projects through Application Default Credentials
// (`gcloud auth application-default login` as a project member).
export async function withFirestore<T>(
  target: FirestoreTarget,
  run: (db: Firestore) => Promise<T>,
): Promise<T> {
  let app;
  if (target.kind === "emulator") {
    // Never accept arbitrary hosts in the seed/import pipeline.
    if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080")
      throw new Error(
        "FIRESTORE_EMULATOR_HOST must be 127.0.0.1:8080; run the local emulators first.",
      );
    app = initializeApp(
      { projectId: emulatorProjectId },
      `emulator-${Date.now()}-${Math.random()}`,
    );
  } else {
    // A leftover emulator variable would silently redirect "real" writes.
    if (process.env.FIRESTORE_EMULATOR_HOST)
      throw new Error(
        "Unset FIRESTORE_EMULATOR_HOST before writing to a real project.",
      );
    // User ADC needs a quota project for the Firestore API.
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= target.projectId;
    app = initializeApp(
      { projectId: target.projectId, credential: applicationDefault() },
      `${target.projectId}-${Date.now()}`,
    );
  }
  try {
    return await run(getFirestore(app));
  } finally {
    await deleteApp(app);
  }
}
