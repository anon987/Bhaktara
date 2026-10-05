import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  Transaction,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { AdminRole, can, isAdminRole, Permission } from "../../src/domain/cms";

const app = () => getApps()[0] ?? initializeApp();
export const db = () => getFirestore(app());
export const adminAuth = () => getAuth(app());

// The authenticated operator behind a callable, or a scheduled job. SYSTEM
// actors are only constructed server-side (never from a request).
export type Actor = { uid: string; role: AdminRole | "SYSTEM" };

// Admin callables need a non-anonymous sign-in with a role claim (doc 07).
export function actorFrom(auth: CallableRequest["auth"]): Actor {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const provider = (auth.token.firebase as { sign_in_provider?: string })
    ?.sign_in_provider;
  const role = auth.token.role;
  if (provider === "anonymous" || !isAdminRole(role)) {
    logger.warn("Admin call without an admin role", {
      uid: auth.uid,
      provider,
    });
    throw new HttpsError("permission-denied", "This account has no CMS role.");
  }
  return { uid: auth.uid, role };
}

export function requirePermission(actor: Actor, permission: Permission) {
  if (actor.role !== "SYSTEM" && !can(actor.role, permission)) {
    logger.warn("Admin permission denied", {
      uid: actor.uid,
      role: actor.role,
      permission,
    });
    throw new HttpsError(
      "permission-denied",
      `Your role (${actor.role}) cannot do this.`,
    );
  }
}

// Zod at the boundary; issues are safe to return (field paths and messages).
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new HttpsError("invalid-argument", "Some fields are invalid.", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  return result.data;
}

export type AuditEntry = {
  action: string;
  entity:
    | "content"
    | "banner"
    | "adminRole"
    | "media"
    | "homeLayout"
    | "homeFeed"
    | "deity"
    | "category"
    | "collection"
    | "challenge"
    | "badge"
    | "festival"
    | "mandirOffering"
    | "config"
    | "user"
    | "asset";
  entityId: string;
  beforeSummary: Record<string, unknown> | null;
  afterSummary: Record<string, unknown> | null;
};

// Doc 09 §16 / doc 06 auditLogs. Written in the same transaction as the
// mutation, so a change without its audit entry cannot be committed.
export function writeAudit(tx: Transaction, actor: Actor, entry: AuditEntry) {
  tx.create(db().collection("auditLogs").doc(), {
    adminUid: actor.uid,
    ...entry,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Firestore rejects undefined values; optional fields are simply omitted.
export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
