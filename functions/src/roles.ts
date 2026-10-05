import { HttpsError } from "firebase-functions/v2/https";
import { isAdminRole, setAdminRoleSchema } from "../../src/domain/cms";
import {
  Actor,
  adminAuth,
  db,
  parse,
  requirePermission,
  writeAudit,
} from "./core";

// Doc 08 §3 setAdminRole (SUPER_ADMIN). The role takes effect when the user's
// ID token refreshes (sign out and in, or the CMS "Refresh access" action).
export async function setAdminRole(actor: Actor, data: unknown) {
  requirePermission(actor, "role.write");
  const { email, role } = parse(setAdminRoleSchema, data);
  const user = await adminAuth()
    .getUserByEmail(email)
    .catch(() => {
      throw new HttpsError(
        "not-found",
        "No user with that email has signed in yet.",
      );
    });
  if (user.uid === actor.uid)
    throw new HttpsError(
      "failed-precondition",
      "You cannot change your own role.",
    );
  const claims = { ...(user.customClaims ?? {}) };
  const previous = isAdminRole(claims.role) ? claims.role : null;
  if (role) claims.role = role;
  else delete claims.role;
  // Audit first: if writing the audit entry fails, the claim is not changed.
  await db().runTransaction(async (tx) => {
    writeAudit(tx, actor, {
      action: "adminRole.set",
      entity: "adminRole",
      entityId: user.uid,
      beforeSummary: { role: previous },
      afterSummary: { role },
    });
  });
  await adminAuth().setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, role };
}
