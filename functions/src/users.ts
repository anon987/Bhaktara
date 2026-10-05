// Admin panel v2: users (doc 09 §14). Search and view (MODERATOR+),
// moderation (flag, reset display name, notes) and account management
// (disable, delete: SUPER_ADMIN). Never returns credentials or tokens.
import { UserRecord } from "firebase-admin/auth";
import {
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  deleteUserSchema,
  getUserSchema,
  moderateUserSchema,
  searchUsersSchema,
  setUserDisabledSchema,
} from "../../src/domain/admin";
import { addDays, bhaktiDayAt } from "../../src/domain/progression";
import { isAdminRole } from "../../src/domain/cms";
import { Actor, adminAuth, db, parse, requirePermission, writeAudit } from "./core";

const iso = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : null;

export type UserRow = {
  uid: string;
  displayName: string | null;
  isAnonymous: boolean;
  language: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  totalXp: number;
  level: number;
  currentStreak: number;
  flagged: boolean;
  disabled: boolean;
};

async function rows(uids: string[]): Promise<UserRow[]> {
  if (uids.length === 0) return [];
  const refs = uids.flatMap((uid) => [
    db().collection("users").doc(uid),
    db().collection("userStats").doc(uid),
  ]);
  const snaps = await db().getAll(...refs);
  return uids.map((uid, i) => {
    const user = snaps[i * 2].data() ?? {};
    const stats = snaps[i * 2 + 1].data() ?? {};
    return {
      uid,
      displayName: typeof user.displayName === "string" ? user.displayName : null,
      isAnonymous: user.isAnonymous !== false,
      language: typeof user.language === "string" ? user.language : null,
      createdAt: iso(user.createdAt),
      lastActiveAt: iso(user.lastActiveAt),
      totalXp: Number(stats.totalXp ?? 0),
      level: Number(stats.level ?? 1),
      currentStreak: Number(stats.currentStreak ?? 0),
      flagged: stats.flags?.suspicious === true,
      disabled: user.disabled === true,
    };
  });
}

export async function searchUsers(actor: Actor, data: unknown) {
  requirePermission(actor, "user.read");
  const input = parse(searchUsersSchema, data);
  const query = input.query?.trim();
  // A direct hit by UID or email.
  if (query) {
    let found: UserRecord | null = null;
    try {
      found = query.includes("@")
        ? await adminAuth().getUserByEmail(query)
        : await adminAuth().getUser(query);
    } catch {
      found = null;
    }
    if (found) return { items: await rows([found.uid]), next: null };
    // Otherwise a display-name prefix.
    const page = await db()
      .collection("users")
      .where("displayName", ">=", query)
      .where("displayName", "<", `${query}`)
      .orderBy("displayName")
      .limit(input.pageSize)
      .get();
    return { items: await rows(page.docs.map((doc) => doc.id)), next: null };
  }
  if (input.filter === "flagged") {
    const page = await db()
      .collection("userStats")
      .where("flags.suspicious", "==", true)
      .orderBy(FieldPath.documentId())
      .startAfter(input.after ?? "")
      .limit(input.pageSize)
      .get();
    const uids = page.docs.map((doc) => doc.id);
    return {
      items: await rows(uids),
      next: uids.length === input.pageSize ? uids[uids.length - 1] : null,
    };
  }
  // Newest first, optionally only guests, signed-in or disabled accounts.
  let users = db().collection("users").orderBy("createdAt", "desc");
  if (input.filter === "guests") users = users.where("isAnonymous", "==", true);
  if (input.filter === "signedIn") users = users.where("isAnonymous", "==", false);
  if (input.filter === "disabled") users = users.where("disabled", "==", true);
  if (input.after) {
    const cursor = await db().collection("users").doc(input.after).get();
    if (cursor.exists) users = users.startAfter(cursor);
  }
  const page = await users.limit(input.pageSize).get();
  const uids = page.docs.map((doc) => doc.id);
  return {
    items: await rows(uids),
    next: uids.length === input.pageSize ? uids[uids.length - 1] : null,
  };
}

export async function getUserDetail(actor: Actor, data: unknown) {
  requirePermission(actor, "user.read");
  const { uid } = parse(getUserSchema, data);
  let auth: UserRecord | null = null;
  try {
    auth = await adminAuth().getUser(uid);
  } catch {
    auth = null;
  }
  const [profile, stats, admin] = await db().getAll(
    db().collection("users").doc(uid),
    db().collection("userStats").doc(uid),
    db().collection("userAdmin").doc(uid),
  );
  if (!auth && !profile.exists)
    throw new HttpsError("not-found", "No such user.");
  const timezone = (profile.get("timezone") as string | undefined) ?? "Asia/Kolkata";
  const from = addDays(bhaktiDayAt(Date.now(), timezone), -41);
  const [days, badges] = await Promise.all([
    db()
      .collection("users")
      .doc(uid)
      .collection("days")
      .where(FieldPath.documentId(), ">=", from)
      .orderBy(FieldPath.documentId())
      .get(),
    db().collection("users").doc(uid).collection("badges").limit(100).get(),
  ]);
  const p = profile.data() ?? {};
  const s = stats.data() ?? {};
  return {
    uid,
    auth: auth && {
      // Provider names only; never tokens, hashes or credentials.
      providers: auth.providerData.map((provider) => provider.providerId),
      isAnonymous: auth.providerData.length === 0,
      email: auth.email ?? null,
      createdAt: auth.metadata.creationTime ?? null,
      lastSignInAt: auth.metadata.lastSignInTime ?? null,
      disabled: auth.disabled,
      role: isAdminRole(auth.customClaims?.role) ? auth.customClaims?.role : null,
    },
    profile: {
      displayName: p.displayName ?? null,
      language: p.language ?? null,
      timezone,
      mandirDeityId: p.mandirDeityId ?? null,
      createdAt: iso(p.createdAt),
      lastActiveAt: iso(p.lastActiveAt),
    },
    stats: {
      totalXp: Number(s.totalXp ?? 0),
      level: Number(s.level ?? 1),
      rank: s.rank ?? "JIGYASU",
      currentStreak: Number(s.currentStreak ?? 0),
      longestStreak: Number(s.longestStreak ?? 0),
      lastQualifyingDay: s.lastQualifyingDay ?? null,
      counters: s.counters ?? {},
      flags: s.flags ?? { suspicious: false },
    },
    days: days.docs.map((doc) => ({
      day: doc.id,
      xp: Number(doc.get("xp") ?? 0),
      qualifying: doc.get("qualifying") === true,
      fullSadhana: doc.get("fullSadhana") === true,
      tasks: doc.get("tasks") ?? {},
    })),
    badges: badges.docs.map((doc) => ({
      id: doc.id,
      unlockedAt: iso(doc.get("unlockedAt")),
    })),
    notes: ((admin.get("notes") as { text: string; by: string; at: Timestamp }[] | undefined) ?? [])
      .slice(-50)
      .map((note) => ({ text: note.text, by: note.by, at: iso(note.at) })),
  };
}

export async function moderateUser(actor: Actor, data: unknown) {
  requirePermission(actor, "user.moderate");
  const input = parse(moderateUserSchema, data);
  const statsRef = db().collection("userStats").doc(input.uid);
  const userRef = db().collection("users").doc(input.uid);
  const adminRef = db().collection("userAdmin").doc(input.uid);
  await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef);
    if (!user.exists) throw new HttpsError("not-found", "No such user.");
    if (input.action === "flag")
      tx.set(
        statsRef,
        { flags: { suspicious: true, reason: input.reason, by: actor.uid, at: FieldValue.serverTimestamp() } },
        { merge: true },
      );
    if (input.action === "unflag")
      tx.set(statsRef, { flags: { suspicious: false } }, { merge: true });
    if (input.action === "resetDisplayName") tx.update(userRef, { displayName: null });
    if (input.action === "note")
      tx.set(
        adminRef,
        { notes: FieldValue.arrayUnion({ text: input.note, by: actor.uid, at: Timestamp.now() }) },
        { merge: true },
      );
    writeAudit(tx, actor, {
      action: `user.${input.action}`,
      entity: "user",
      entityId: input.uid,
      beforeSummary: input.action === "resetDisplayName" ? { displayName: user.get("displayName") ?? null } : null,
      afterSummary:
        input.action === "flag"
          ? { reason: input.reason }
          : input.action === "note"
            ? { note: input.note.slice(0, 120) }
            : null,
    });
  });
  return { uid: input.uid, action: input.action };
}

async function guardTarget(actor: Actor, uid: string) {
  if (uid === actor.uid)
    throw new HttpsError("failed-precondition", "You cannot do this to your own account.");
  const record = await adminAuth().getUser(uid).catch(() => null);
  if (record && isAdminRole(record.customClaims?.role))
    throw new HttpsError(
      "failed-precondition",
      "This account holds a CMS role. Remove the role first.",
      { reason: "ADMIN_ACCOUNT" },
    );
  return record;
}

export async function setUserDisabled(actor: Actor, data: unknown) {
  requirePermission(actor, "user.manage");
  const input = parse(setUserDisabledSchema, data);
  const record = await guardTarget(actor, input.uid);
  if (!record) throw new HttpsError("not-found", "No such sign-in account.");
  await adminAuth().updateUser(input.uid, { disabled: input.disabled });
  // Signed-in sessions end at the next token refresh.
  if (input.disabled) await adminAuth().revokeRefreshTokens(input.uid);
  await db().runTransaction(async (tx) => {
    tx.set(db().collection("users").doc(input.uid), { disabled: input.disabled }, { merge: true });
    writeAudit(tx, actor, {
      action: input.disabled ? "user.disable" : "user.enable",
      entity: "user",
      entityId: input.uid,
      beforeSummary: { disabled: record.disabled },
      afterSummary: { disabled: input.disabled, reason: input.reason },
    });
  });
  return { uid: input.uid, disabled: input.disabled };
}

// Deletes the sign-in account and every document about the user; reward
// ledger lines are kept for accounting but no longer name the user.
export async function deleteUserAccount(actor: Actor, data: unknown) {
  requirePermission(actor, "user.manage");
  const input = parse(deleteUserSchema, data);
  const record = await guardTarget(actor, input.uid);
  const firestore = db();
  const profile = await firestore.collection("users").doc(input.uid).get();
  if (!record && !profile.exists) throw new HttpsError("not-found", "No such user.");
  await firestore.recursiveDelete(firestore.collection("users").doc(input.uid));
  await firestore.recursiveDelete(firestore.collection("userAdmin").doc(input.uid));
  await firestore.collection("userStats").doc(input.uid).delete();
  const deleteWhere = async (collection: string, update?: Record<string, unknown>) => {
    for (;;) {
      const page = await firestore
        .collection(collection)
        .where("uid", "==", input.uid)
        .limit(400)
        .get();
      if (page.empty) return;
      const batch = firestore.batch();
      for (const doc of page.docs as DocumentSnapshot[])
        if (update) batch.update(doc.ref, update);
        else batch.delete(doc.ref);
      await batch.commit();
    }
  };
  await deleteWhere("userChallenges");
  await deleteWhere("rewardTransactions", { uid: "deleted-user", deletedAt: FieldValue.serverTimestamp() });
  if (record) await adminAuth().deleteUser(input.uid);
  await firestore.runTransaction(async (tx) => {
    writeAudit(tx, actor, {
      action: "user.delete",
      entity: "user",
      entityId: input.uid,
      beforeSummary: { hadAuth: !!record, hadProfile: profile.exists },
      afterSummary: { reason: input.reason },
    });
  });
  return { uid: input.uid, deleted: true };
}

// Staff accounts holding a CMS role (Roles page). Scans sign-in accounts in
// pages of 1000; fine for the operator-sized project this is.
export async function listAdmins(actor: Actor) {
  requirePermission(actor, "role.read");
  const admins: {
    uid: string;
    email: string | null;
    displayName: string | null;
    role: string;
    lastSignInAt: string | null;
    disabled: boolean;
  }[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await adminAuth().listUsers(1000, pageToken);
    for (const user of result.users)
      if (isAdminRole(user.customClaims?.role))
        admins.push({
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
          role: user.customClaims?.role as string,
          lastSignInAt: user.metadata.lastSignInTime ?? null,
          disabled: user.disabled,
        });
    pageToken = result.pageToken;
    if (!pageToken) break;
  }
  return { admins };
}
