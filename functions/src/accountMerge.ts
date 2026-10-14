// mergeGuestAccount (doc 21 §3–4, D-017, D-020): after a guest signs in with a
// Google account that already has Bhaktara data, the app calls this as the
// account with the guest's ID token. The rules are in mergeRules.ts.
//
// Retry safety: accountMerges/{guestUid} is claimed first (IN_PROGRESS, with
// the target account). Every batch of copies then runs in a transaction that
// re-reads that document, writes only what the account does not have yet
// (ledger entries, badges, favorites by ID; days and challenges carry the
// guest UID in `mergedFrom`) and adds what it wrote to `progress` in the same
// commit. The final transaction applies `progress` to userStats once and
// marks the merge MERGED. A call that fails part-way can simply be repeated;
// a call after MERGED returns the stored summary.
import { DecodedIdToken } from "firebase-admin/auth";
import {
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  Query,
  Timestamp,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { mergeGuestAccountSchema, MergeSummary } from "../../src/domain/account";
import { adminAuth, db, parse, stripUndefined, writeAudit } from "./core";
import {
  addCounters,
  countLedgerEntry,
  emptyMergeProgress,
  ledgerEntryFor,
  mergeChallenge,
  mergeDay,
  MergeProgress,
  mergeStats,
  normalizeProgress,
  profileFallbacks,
} from "./mergeRules";
import { photoKeyExt, PhotoStore, photoStoreFromEnv } from "./profile";
import { defaultNotificationPreferences, loadCatalog, newProfile, Player } from "./progression";
import { ledgerId, normalizeStats } from "./progressionEngine";
import { RewardType } from "../../src/domain/progression";

// Guest documents are deleted this long after the merge (doc 08 §4
// cleanupMergedGuests), leaving time to investigate a disputed merge.
export const MERGED_GUEST_RETENTION_DAYS = 7;
const PAGE = 150;

export type MergeErrorReason =
  | "SIGN_IN_REQUIRED"
  | "GUEST_TOKEN_INVALID"
  | "GUEST_TOKEN_EXPIRED"
  | "GUEST_NOT_ANONYMOUS"
  | "SAME_ACCOUNT"
  | "GUEST_NOT_FOUND"
  | "ALREADY_MERGED_ELSEWHERE";

export function mergeError(reason: MergeErrorReason, message: string) {
  const code =
    reason === "SIGN_IN_REQUIRED"
      ? "permission-denied"
      : reason === "GUEST_NOT_FOUND"
        ? "not-found"
        : reason === "GUEST_TOKEN_INVALID" ||
            reason === "GUEST_TOKEN_EXPIRED" ||
            reason === "SAME_ACCOUNT"
          ? "invalid-argument"
          : "failed-precondition";
  return new HttpsError(code, message, { reason });
}

// Auth operations, replaceable in tests.
export type MergeAuth = {
  verifyIdToken(token: string): Promise<DecodedIdToken>;
  // null when the Auth user does not exist.
  getUser(uid: string): Promise<{ isAnonymous: boolean } | null>;
  // Succeeds when the user is already gone.
  deleteUser(uid: string): Promise<void>;
};

const authCode = (error: unknown) => (error as { code?: string }).code ?? "";

export const firebaseMergeAuth = (): MergeAuth => ({
  verifyIdToken: (token) => adminAuth().verifyIdToken(token),
  async getUser(uid) {
    try {
      const user = await adminAuth().getUser(uid);
      return { isAnonymous: user.providerData.length === 0 };
    } catch (error) {
      if (authCode(error) === "auth/user-not-found") return null;
      throw error;
    }
  },
  async deleteUser(uid) {
    try {
      await adminAuth().deleteUser(uid);
    } catch (error) {
      if (authCode(error) !== "auth/user-not-found") throw error;
    }
  },
});

// The guest's UID, trusted only from a verified ID token (doc 21 §11).
export async function verifyGuestToken(
  auth: MergeAuth,
  token: string,
  callerUid: string,
): Promise<string> {
  let decoded: DecodedIdToken;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (error) {
    // The Auth emulator always looks the user up after checking the token,
    // so a retry after the guest was deleted fails with user-not-found even
    // though the token itself verified. That error only comes after the
    // signature and claims passed, so the payload can be trusted here.
    if (authCode(error) === "auth/user-not-found") {
      const payload = verifiedPayload(token);
      if (payload) return checkGuestClaims(payload, callerUid);
    }
    if (authCode(error) === "auth/id-token-expired")
      throw mergeError(
        "GUEST_TOKEN_EXPIRED",
        "The guest session has expired, so its progress cannot be added.",
      );
    throw mergeError("GUEST_TOKEN_INVALID", "The guest session could not be verified.");
  }
  return checkGuestClaims(decoded, callerUid);
}

function verifiedPayload(token: string): DecodedIdToken | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.sub === "string" ? { ...payload, uid: payload.sub } : null;
  } catch {
    return null;
  }
}

function checkGuestClaims(decoded: DecodedIdToken, callerUid: string): string {
  if (decoded.firebase?.sign_in_provider !== "anonymous")
    throw mergeError("GUEST_NOT_ANONYMOUS", "Only guest progress can be added to an account.");
  if (decoded.uid === callerUid)
    throw mergeError("SAME_ACCOUNT", "This guest session is already this account.");
  return decoded.uid;
}

const mergeRef = (guestUid: string) => db().collection("accountMerges").doc(guestUid);

const storedSummary = (merge: DocumentSnapshot): MergeSummary => ({
  ...(merge.get("summary") as Omit<MergeSummary, "alreadyMerged">),
  alreadyMerged: true,
});

// ---- Batches ---------------------------------------------------------------------

type Batch = {
  // Guest documents in this batch.
  docs: DocumentSnapshot[];
  // The account document each one goes to.
  target: (doc: DocumentSnapshot) => DocumentReference;
  // Queues the writes for one document (given the account's current copy)
  // and records them in progress.
  apply: (
    write: {
      set: (ref: DocumentReference, data: Record<string, unknown>, merge?: boolean) => void;
    },
    guest: DocumentSnapshot,
    existing: DocumentSnapshot,
    progress: MergeProgress,
  ) => void;
};

// One batch in one transaction, guarded by the merge document. Returns false
// when the merge is no longer in progress for this account (a parallel call
// finished it), so the caller stops.
async function runBatch(guestUid: string, targetUid: string, batch: Batch) {
  if (batch.docs.length === 0) return true;
  return db().runTransaction(async (tx) => {
    const [merge, ...existing] = await tx.getAll(
      mergeRef(guestUid),
      ...batch.docs.map(batch.target),
    );
    if (merge.get("status") !== "IN_PROGRESS" || merge.get("targetUid") !== targetUid)
      return false;
    const progress = normalizeProgress(merge.get("progress"));
    const write = {
      set: (ref: DocumentReference, data: Record<string, unknown>, merge = false) =>
        merge ? tx.set(ref, data, { merge: true }) : tx.set(ref, data),
    };
    batch.docs.forEach((doc, index) => batch.apply(write, doc, existing[index], progress));
    tx.update(mergeRef(guestUid), { progress, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

// Pages through a guest query in document-ID order.
async function* pages(query: Query): AsyncGenerator<DocumentSnapshot[]> {
  let last: DocumentSnapshot | undefined;
  for (;;) {
    let page = query.orderBy(FieldPath.documentId()).limit(PAGE);
    if (last) page = page.startAfter(last);
    const snapshot = await page.get();
    if (snapshot.empty) return;
    yield snapshot.docs;
    if (snapshot.size < PAGE) return;
    last = snapshot.docs[snapshot.size - 1];
  }
}

async function copyAll(
  guestUid: string,
  targetUid: string,
  query: Query,
  target: Batch["target"],
  apply: Batch["apply"],
) {
  for await (const docs of pages(query))
    if (!(await runBatch(guestUid, targetUid, { docs, target, apply }))) return false;
  return true;
}

const hasMarker = (existing: DocumentSnapshot, guestUid: string) => {
  const marker = existing.get("mergedFrom");
  return Array.isArray(marker) ? marker.includes(guestUid) : marker === guestUid;
};

async function copyGuestData(guestUid: string, targetUid: string, now: Timestamp) {
  const firestore = db();
  const guestUser = firestore.collection("users").doc(guestUid);
  const user = firestore.collection("users").doc(targetUid);
  // 1. XP ledger first: the day merge needs the XP copied per day.
  const ledgerDone = await copyAll(
    guestUid,
    targetUid,
    firestore.collection("rewardTransactions").where("uid", "==", guestUid),
    (doc) =>
      firestore
        .collection("rewardTransactions")
        .doc(
          ledgerId(targetUid, {
            type: doc.get("type") as RewardType,
            sourceId: String(doc.get("sourceId")),
          }),
        ),
    (write, guest, existing, progress) => {
      if (existing.exists || !guest.get("type") || !guest.get("sourceId")) return;
      const entry = ledgerEntryFor(guest.data()!, targetUid, guestUid, now);
      write.set(existing.ref, entry);
      countLedgerEntry(progress, entry);
    },
  );
  if (!ledgerDone) return false;
  // 2. Badges: union. Their XP came with the ledger (BADGE badge:{id}), so a
  // badge the account already owns pays nothing again.
  const steps: [Query, Batch["target"], Batch["apply"]][] = [
    [
      guestUser.collection("badges"),
      (doc) => user.collection("badges").doc(doc.id),
      (write, guest, existing, progress) => {
        if (existing.exists) return;
        write.set(existing.ref, { ...guest.data(), badgeId: guest.id, mergedFrom: guestUid });
        progress.badgesAdded += 1;
        progress.badgeIds.push(guest.id);
      },
    ],
    // 3. Favorites: union (doc ID is the content ID).
    [
      guestUser.collection("favorites"),
      (doc) => user.collection("favorites").doc(doc.id),
      (write, guest, existing, progress) => {
        if (existing.exists) return;
        write.set(existing.ref, guest.data()!);
        progress.favoritesAdded += 1;
      },
    ],
    // 4. Sadhana history: one entry per day and task.
    [
      guestUser.collection("days"),
      (doc) => user.collection("days").doc(doc.id),
      (write, guest, existing, progress) => {
        if (hasMarker(existing, guestUid)) return;
        const merged = mergeDay(
          existing.exists ? existing.data() : undefined,
          guest.data()!,
          progress.xpByDay[guest.id] ?? 0,
        );
        write.set(
          existing.ref,
          {
            ...merged.doc,
            day: guest.id,
            updatedAt: now,
            mergedFrom: FieldValue.arrayUnion(guestUid),
          },
          !merged.added,
        );
        if (merged.added) progress.daysAdded += 1;
        addCounters(progress.counters, merged.counters);
      },
    ],
    // 5. Challenges: higher progress, completion from either, reward once.
    [
      firestore.collection("userChallenges").where("uid", "==", guestUid),
      (doc) =>
        firestore
          .collection("userChallenges")
          .doc(`${targetUid}${doc.id.slice(guestUid.length)}`),
      (write, guest, existing, progress) => {
        if (!guest.id.startsWith(`${guestUid}_`) || hasMarker(existing, guestUid)) return;
        const merged = mergeChallenge(
          existing.exists ? existing.data() : undefined,
          guest.data()!,
          targetUid,
        );
        write.set(
          existing.ref,
          { ...merged.doc, updatedAt: now, mergedFrom: FieldValue.arrayUnion(guestUid) },
          existing.exists,
        );
        progress.challengesMerged += 1;
        if (merged.completed) progress.counters.challengesCompleted += 1;
      },
    ],
  ];
  for (const [query, target, apply] of steps)
    if (!(await copyAll(guestUid, targetUid, query, target, apply))) return false;
  return true;
}

// ---- Final step ------------------------------------------------------------------

async function finalize(guestUid: string, targetUid: string, now: Timestamp) {
  const { config } = await loadCatalog();
  const firestore = db();
  const refs = {
    merge: mergeRef(guestUid),
    stats: firestore.collection("userStats").doc(targetUid),
    guestStats: firestore.collection("userStats").doc(guestUid),
    user: firestore.collection("users").doc(targetUid),
    guestUser: firestore.collection("users").doc(guestUid),
  };
  return firestore.runTransaction(async (tx) => {
    const [merge, stats, guestStats, user, guestUser] = await tx.getAll(
      refs.merge,
      refs.stats,
      refs.guestStats,
      refs.user,
      refs.guestUser,
    );
    if (merge.get("status") === "MERGED") return storedSummary(merge);
    const progress = normalizeProgress(merge.get("progress"));
    const merged = mergeStats(
      normalizeStats(stats.data(), config),
      normalizeStats(guestStats.data(), config),
      progress,
      config,
    );
    tx.set(refs.stats, stripUndefined({ ...merged, updatedAt: now }));

    const guestProfile = guestUser.data() ?? {};
    if (user.exists)
      tx.update(refs.user, {
        ...profileFallbacks(user.data()!, guestProfile),
        isAnonymous: false,
        lastActiveAt: now,
      });
    else {
      // An account without a profile yet: the guest's preferences seed it;
      // name and photo stay empty (they are the account's to choose).
      const language = guestProfile.language === "en" ? "en" : "hi";
      const timezone =
        typeof guestProfile.timezone === "string" ? guestProfile.timezone : "Asia/Kolkata";
      tx.create(refs.user, {
        ...newProfile({ uid: targetUid, isAnonymous: false }, timezone, language, now),
        mandirDeityId:
          typeof guestProfile.mandirDeityId === "string" ? guestProfile.mandirDeityId : null,
        notificationPreferences:
          guestProfile.notificationPreferences ?? defaultNotificationPreferences,
      });
    }
    if (guestUser.exists)
      tx.update(refs.guestUser, { mergedInto: targetUid, mergedAt: now });

    const summary: Omit<MergeSummary, "alreadyMerged"> = {
      xpAdded: progress.xpAdded,
      badgesAdded: progress.badgesAdded,
      favoritesAdded: progress.favoritesAdded,
      daysAdded: progress.daysAdded,
    };
    tx.update(refs.merge, {
      status: "MERGED",
      summary,
      mergedAt: now,
      updatedAt: now,
      cleanupAfter: Timestamp.fromMillis(
        now.toMillis() + MERGED_GUEST_RETENTION_DAYS * 86_400_000,
      ),
    });
    writeAudit(
      tx,
      { uid: targetUid, role: "SYSTEM" },
      {
        action: "account.mergeGuest",
        entity: "user",
        entityId: targetUid,
        beforeSummary: { guestUid },
        afterSummary: {
          ...summary,
          ledgerAdded: progress.ledgerAdded,
          challengesMerged: progress.challengesMerged,
          totalXp: merged.totalXp,
          currentStreak: merged.currentStreak,
        },
      },
    );
    return { ...summary, alreadyMerged: false };
  });
}

// The anonymous Auth user goes as soon as the data is merged; a failure is
// retried by the next call and by cleanupMergedGuests.
async function deleteGuestAuth(auth: MergeAuth, guestUid: string) {
  try {
    await auth.deleteUser(guestUid);
    await mergeRef(guestUid).update({ guestAuthDeleted: true });
  } catch (error) {
    logger.warn("Could not delete the merged guest's Auth user", {
      guestUid,
      error: String(error),
    });
  }
}

// ---- mergeGuestAccount -------------------------------------------------------------

export async function mergeGuestAccount(
  player: Player,
  data: unknown,
  deps: { auth?: MergeAuth } = {},
): Promise<MergeSummary> {
  if (player.isAnonymous)
    throw mergeError("SIGN_IN_REQUIRED", "Sign in with Google before adding guest progress.");
  const input = parse(mergeGuestAccountSchema, data);
  const auth = deps.auth ?? firebaseMergeAuth();
  const guestUid = await verifyGuestToken(auth, input.guestIdToken, player.uid);

  // Claim (or resume) the merge.
  const existing = await mergeRef(guestUid).get();
  if (!existing.exists) {
    const guest = await auth.getUser(guestUid);
    if (!guest) throw mergeError("GUEST_NOT_FOUND", "This guest account no longer exists.");
    if (!guest.isAnonymous)
      throw mergeError("GUEST_NOT_ANONYMOUS", "Only guest progress can be added to an account.");
  }
  const now = Timestamp.now();
  const claim = await db().runTransaction(async (tx) => {
    const merge = await tx.get(mergeRef(guestUid));
    if (merge.exists) {
      if (merge.get("targetUid") !== player.uid)
        throw mergeError(
          "ALREADY_MERGED_ELSEWHERE",
          "This guest progress was already added to another account.",
        );
      return merge.get("status") === "MERGED" ? { done: merge } : { done: null };
    }
    tx.create(mergeRef(guestUid), {
      guestUid,
      targetUid: player.uid,
      status: "IN_PROGRESS",
      progress: emptyMergeProgress(),
      createdAt: now,
      updatedAt: now,
    });
    return { done: null };
  });
  if (claim.done) {
    if (claim.done.get("guestAuthDeleted") !== true) await deleteGuestAuth(auth, guestUid);
    return storedSummary(claim.done);
  }

  await copyGuestData(guestUid, player.uid, now);
  const summary = await finalize(guestUid, player.uid, now);
  await deleteGuestAuth(auth, guestUid);
  logger.info("Guest merged into account", { guestUid, targetUid: player.uid, ...summary });
  return summary;
}

// ---- cleanupMergedGuests (doc 08 §4) ---------------------------------------------------

// Daily: deletes the documents of guests merged more than
// MERGED_GUEST_RETENTION_DAYS ago (profile and subcollections, stats,
// challenges, ledger lines already copied to the account, the profile photo)
// and the Auth user if it is still there. The merge record stays, without
// `cleanupAfter`, as the audit trail and the idempotency key.
export async function cleanupMergedGuests(
  now = Timestamp.now(),
  deps: { auth?: MergeAuth; store?: PhotoStore | null; limit?: number } = {},
) {
  const auth = deps.auth ?? firebaseMergeAuth();
  const store = deps.store === undefined ? photoStoreFromEnv() : deps.store;
  const firestore = db();
  const due = await firestore
    .collection("accountMerges")
    .where("cleanupAfter", "<=", now)
    .limit(deps.limit ?? 50)
    .get();
  let cleaned = 0;
  for (const merge of due.docs) {
    const guestUid = merge.id;
    try {
      const user = firestore.collection("users").doc(guestUid);
      const photoKey = (await user.get()).get("photoKey");
      await firestore.recursiveDelete(user);
      await firestore.collection("userStats").doc(guestUid).delete();
      for (const collection of ["userChallenges", "rewardTransactions"])
        for (;;) {
          const page = await firestore
            .collection(collection)
            .where("uid", "==", guestUid)
            .limit(400)
            .get();
          if (page.empty) break;
          const batch = firestore.batch();
          page.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      await auth.deleteUser(guestUid);
      if (typeof photoKey === "string" && photoKeyExt(guestUid, photoKey) && store)
        await store.remove(photoKey).catch(() => undefined);
      await merge.ref.update({
        cleanupAfter: FieldValue.delete(),
        cleanedAt: now,
        guestAuthDeleted: true,
      });
      cleaned += 1;
    } catch (error) {
      logger.error("Merged guest cleanup failed; retried tomorrow", {
        guestUid,
        error: String(error),
      });
    }
  }
  return { cleaned };
}
