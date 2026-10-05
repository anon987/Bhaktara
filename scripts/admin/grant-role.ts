import { parseArgs } from "node:util";
import { userInfo } from "node:os";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminRoles, AdminRole, isAdminRole } from "../../src/domain/cms";
import { projectId as emulatorProjectId } from "../emulator/environment";
import {
  describeTarget,
  FirestoreTarget,
  resolveTarget,
  withFirestore,
} from "../firebase/target";

const usage = `Grant (or remove) an Admin CMS role claim (doc 09 §15).

  npm run admin:grant-role -- --email you@example.com --role SUPER_ADMIN

  --email <email>        Account to change (it must have signed in once).
  --role <role|none>     ${adminRoles.join(", ")}, or none to remove.
  --create               Emulator only: create the account if it is missing.
  --project <name>       Default: the local emulator. Real projects also need
  --confirm-project <id> repeated, because this grants privileges.

The user picks the change up after an ID-token refresh (sign out and in, or
"Refresh access" in the CMS).`;

const AUTH_EMULATOR = "127.0.0.1:9099";

export async function grantRole(input: {
  target: FirestoreTarget;
  email: string;
  role: AdminRole | null;
  create?: boolean;
  operator?: string;
}) {
  const { target } = input;
  if (target.kind === "emulator") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= AUTH_EMULATOR;
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR)
      throw new Error(`FIREBASE_AUTH_EMULATOR_HOST must be ${AUTH_EMULATOR}.`);
  } else {
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST)
      throw new Error("Unset FIREBASE_AUTH_EMULATOR_HOST first.");
    if (input.create)
      throw new Error("--create is only allowed for the emulator.");
  }
  const app = initializeApp(
    {
      projectId:
        target.kind === "emulator" ? emulatorProjectId : target.projectId,
    },
    `grant-role-${Date.now()}`,
  );
  try {
    const auth = getAuth(app);
    const user = await auth.getUserByEmail(input.email).catch(async (error) => {
      if (!input.create) throw error;
      return auth.createUser({ email: input.email, emailVerified: true });
    });
    const claims = { ...(user.customClaims ?? {}) };
    const previous = isAdminRole(claims.role) ? claims.role : null;
    if (input.role) claims.role = input.role;
    else delete claims.role;
    // Every admin mutation is audited (doc 09 §16), including this bootstrap.
    await withFirestore(target, (db) =>
      db.collection("auditLogs").add({
        adminUid: `script:${input.operator ?? userInfo().username}`,
        action: "adminRole.set",
        entity: "adminRole",
        entityId: user.uid,
        beforeSummary: { role: previous },
        afterSummary: { role: input.role },
        createdAt: FieldValue.serverTimestamp(),
      }),
    );
    await auth.setCustomUserClaims(user.uid, claims);
    return { uid: user.uid, previous, role: input.role };
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1]?.endsWith("grant-role.ts")) {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      role: { type: "string" },
      create: { type: "boolean", default: false },
      project: { type: "string" },
      "confirm-project": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const run = async () => {
    if (values.help || !values.email || !values.role) {
      console.log(usage);
      if (!values.help) process.exitCode = 1;
      return;
    }
    const role = values.role === "none" ? null : values.role;
    if (role !== null && !isAdminRole(role))
      throw new Error(`Unknown role "${values.role}".`);
    const target = resolveTarget(values.project, values["confirm-project"]);
    // Privilege changes on a real project always need explicit confirmation.
    if (
      target.kind === "project" &&
      values["confirm-project"] !== target.projectId
    )
      throw new Error(
        `Refusing to change roles on ${target.projectId} without --confirm-project ${target.projectId}`,
      );
    const result = await grantRole({
      target,
      email: values.email,
      role,
      create: values.create,
    });
    console.log(
      `${describeTarget(target)}: ${values.email} role ${result.previous ?? "none"} → ${result.role ?? "none"}.`,
    );
  };
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
