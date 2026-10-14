// Integration tests for the profile and account callables (doc 21, D-042):
// updateProfile, requestProfilePhotoUpload and mergeGuestAccount, plus the
// merged-guest cleanup. They run inside `npm run test:functions` (Auth,
// Firestore and Functions emulators).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initAdmin,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import type { MergeSummary, ProfilePhotoUpload, ProfileResult } from "../../src/domain/account";
import { bhaktiDayAt } from "../../src/domain/progression";
import { seedEmulator } from "../../scripts/emulator/seed";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "account-test-admin");
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clients: FirebaseApp[] = [];
const prayerItems = ["pushp", "dhoop", "naivedya", "deep", "shankh"];

type Client = {
  uid: string;
  user: User;
  call: <T>(name: string, data?: unknown) => Promise<T>;
};

async function client(email?: string): Promise<Client> {
  const app = initializeApp({ projectId, apiKey: "demo-key" }, `account-client-${clients.length}`);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  let user: User;
  if (email) {
    await adminAuth.createUser({ email, password: "password-123" });
    user = (await signInWithEmailAndPassword(auth, email, "password-123")).user;
  } else user = (await signInAnonymously(auth)).user;
  return {
    uid: user.uid,
    user,
    call: async (name, data) =>
      (await httpsCallable(functions, name, { timeout: 120_000 })(data)).data as never,
  };
}

async function rejects(promise: Promise<unknown>, code: string, reason?: string | string[]) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FunctionsError, String(error));
    assert.equal(error.code, `functions/${code}`, error.message);
    if (reason) {
      const actual = (error.details as { reason?: string })?.reason ?? "";
      assert.ok([reason].flat().includes(actual), `${actual} not in ${reason}`);
    }
    return true;
  });
}

const ledger = async (uid: string) =>
  (await db.collection("rewardTransactions").where("uid", "==", uid).get()).docs.map((d) =>
    d.data(),
  );

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
  ])
    assert.ok((await fetch(url, { method: "DELETE" })).ok);
  await seedEmulator();
});

after(async () => {
  await Promise.all(clients.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

describe("updateProfile", () => {
  test("a guest names themself; the running league row follows, history does not", async () => {
    const guest = await client();
    await guest.call("setTimezone", { timezone: "Asia/Kolkata" });
    await db.doc(`leagueMembers/w2_${guest.uid}`).set({ uid: guest.uid, weekId: "w2", displayName: "Old" });
    await db
      .doc(`leagueMembers/w1_${guest.uid}`)
      .set({ uid: guest.uid, weekId: "w1", displayName: "Old", result: "STAYED" });
    const result = await guest.call<ProfileResult>("updateProfile", { displayName: "  राम   Kumar " });
    assert.deepEqual(result, { displayName: "राम Kumar", photoKey: null });
    const profile = (await db.doc(`users/${guest.uid}`).get()).data()!;
    assert.equal(profile.displayName, "राम Kumar");
    assert.equal(profile.photoKey, null);
    assert.equal(profile.profileLimits.nameChanges, 1);
    assert.equal((await db.doc(`leagueMembers/w2_${guest.uid}`).get()).get("displayName"), "राम Kumar");
    assert.equal((await db.doc(`leagueMembers/w1_${guest.uid}`).get()).get("displayName"), "Old");
    const audit = await db.collection("auditLogs").where("entityId", "==", guest.uid).get();
    assert.deepEqual(
      audit.docs.map((d) => [d.get("action"), d.get("beforeSummary").displayName]),
      [["profile.update", null]],
    );
  });

  test("blocked or malformed names are refused and change nothing", async () => {
    const guest = await client();
    await rejects(
      guest.call("updateProfile", { displayName: "Madar Chod" }),
      "invalid-argument",
      "DISPLAY_NAME_NOT_ALLOWED",
    );
    await rejects(guest.call("updateProfile", { displayName: "R" }), "invalid-argument");
    await rejects(guest.call("updateProfile", { displayName: "Ram123" }), "invalid-argument");
    await rejects(guest.call("updateProfile", {}), "invalid-argument");
    await rejects(guest.call("updateProfile", { displayName: "Ram", language: "en" }), "invalid-argument");
    assert.equal((await db.doc(`users/${guest.uid}`).get()).exists, false);
  });

  test("name changes are limited per day; repeating the same name is free", async () => {
    const guest = await client();
    for (const name of ["Ram", "Shyam", "Sita", "Gita", "Mohan"])
      await guest.call("updateProfile", { displayName: name });
    await guest.call("updateProfile", { displayName: "Mohan" });
    await rejects(
      guest.call("updateProfile", { displayName: "Radha" }),
      "resource-exhausted",
      "RATE_LIMITED",
    );
    assert.equal((await db.doc(`users/${guest.uid}`).get()).get("displayName"), "Mohan");
  });

  test("photo keys must be the user's own upload; null removes the photo", async () => {
    const guest = await client();
    await rejects(
      guest.call("updateProfile", { photoKey: "users/someone-else/photo.0123456789abcdef.jpg" }),
      "invalid-argument",
      "PHOTO_KEY_INVALID",
    );
    await rejects(
      guest.call("updateProfile", { photoKey: `content/x/${guest.uid}.jpg` }),
      "invalid-argument",
      "PHOTO_KEY_INVALID",
    );
    // Not uploaded (or no R2 in this emulator): refused either way.
    await assert.rejects(
      guest.call("updateProfile", { photoKey: `users/${guest.uid}/photo.0123456789abcdef.jpg` }),
      (error: unknown) => {
        assert.ok(error instanceof FunctionsError);
        assert.equal(error.code, "functions/failed-precondition");
        assert.ok(
          ["UPLOADS_NOT_CONFIGURED", "PHOTO_NOT_UPLOADED"].includes(
            (error.details as { reason: string }).reason,
          ),
        );
        return true;
      },
    );
    await db.doc(`users/${guest.uid}`).set({ photoKey: `users/${guest.uid}/photo.00000000000000aa.webp` }, { merge: true });
    const cleared = await guest.call<ProfileResult>("updateProfile", { photoKey: null });
    assert.equal(cleared.photoKey, null);
    assert.equal((await db.doc(`users/${guest.uid}`).get()).get("photoKey"), null);
  });

  test("requestProfilePhotoUpload hands out a key under the user's folder", async () => {
    const guest = await client();
    await rejects(
      guest.call("requestProfilePhotoUpload", { contentType: "image/png", bytes: 10 }),
      "invalid-argument",
    );
    await rejects(
      guest.call("requestProfilePhotoUpload", { contentType: "image/jpeg", bytes: 2_000_000 }),
      "invalid-argument",
    );
    try {
      const slot = await guest.call<ProfilePhotoUpload>("requestProfilePhotoUpload", {
        contentType: "image/jpeg",
        bytes: 20_000,
      });
      assert.match(slot.key, new RegExp(`^users/${guest.uid}/photo\\.[0-9a-f]{16}\\.jpg$`));
      assert.equal(slot.headers["Content-Type"], "image/jpeg");
    } catch (error) {
      // Emulators without R2 keys answer that uploads are not configured.
      assert.ok(error instanceof FunctionsError);
      assert.equal(error.code, "functions/failed-precondition");
      assert.equal((error.details as { reason: string }).reason, "UPLOADS_NOT_CONFIGURED");
    }
  });
});

describe("mergeGuestAccount", () => {
  test("adds the guest's progress once, keeps the account's profile, deletes the guest", async () => {
    const today = bhaktiDayAt(new Date(), "Asia/Kolkata");
    // The guest: prayer and Mandir visit today, two favorites, a name.
    const guest = await client();
    await guest.call("setTimezone", { timezone: "Asia/Kolkata", language: "en" });
    await guest.call("completePrayerChecklist", { itemIds: prayerItems });
    await guest.call("recordMandirVisit", { deityId: "shiva" });
    await guest.call("updateProfile", { displayName: "Guest Name" });
    for (const id of ["bhajan-1", "aarti-1"])
      await db
        .doc(`users/${guest.uid}/favorites/${id}`)
        .set({ contentId: id, type: id.startsWith("aarti") ? "AARTI" : "BHAJAN", createdAt: Timestamp.now() });
    // An older guest-only day and a challenge the guest completed.
    await db.doc(`users/${guest.uid}/days/2026-01-02`).set({
      day: "2026-01-02",
      qualifying: true,
      xp: 10,
      tasks: { jaap: true, meditation: false, prayer: false },
      malas: 1,
    });
    await db.doc(`rewardTransactions/${guest.uid}_TASK_jaap:2026-01-02`).set({
      uid: guest.uid,
      type: "TASK",
      sourceId: "jaap:2026-01-02",
      xp: 10,
      requestedXp: 10,
      status: "GRANTED",
      bhaktiDay: "2026-01-02",
      createdAt: Timestamp.now(),
    });
    // The account: same-day prayer, one shared favorite, its own name.
    const account = await client("devotee@example.com");
    await account.call("setTimezone", { timezone: "Asia/Kolkata", language: "hi" });
    await account.call("completePrayerChecklist", { itemIds: prayerItems });
    await account.call("updateProfile", { displayName: "Account Name" });
    await db
      .doc(`users/${account.uid}/favorites/bhajan-1`)
      .set({ contentId: "bhajan-1", type: "BHAJAN", createdAt: Timestamp.now() });

    const accountLedger = new Set((await ledger(account.uid)).map((e) => `${e.type}_${e.sourceId}`));
    const expectedXp = (await ledger(guest.uid))
      .filter((e) => !accountLedger.has(`${e.type}_${e.sourceId}`))
      .reduce((sum, e) => sum + e.xp, 0);
    assert.ok(expectedXp > 0);
    const before = (await db.doc(`userStats/${account.uid}`).get()).data()!;
    const guestStats = (await db.doc(`userStats/${guest.uid}`).get()).data()!;
    const guestIdToken = await guest.user.getIdToken();

    // Two calls at once (a retry racing the first): XP is still added once.
    const [first, second] = await Promise.all([
      account.call<MergeSummary>("mergeGuestAccount", { guestIdToken }),
      account.call<MergeSummary>("mergeGuestAccount", { guestIdToken }),
    ]);
    const summary = first.alreadyMerged ? second : first;
    assert.deepEqual(
      { ...summary, alreadyMerged: false },
      { alreadyMerged: false, xpAdded: expectedXp, badgesAdded: summary.badgesAdded, favoritesAdded: 1, daysAdded: 1 },
    );

    const after = (await db.doc(`userStats/${account.uid}`).get()).data()!;
    assert.equal(after.totalXp, before.totalXp + expectedXp);
    assert.equal(after.counters.mandirVisits, before.counters.mandirVisits + 1);
    assert.equal(after.counters.malas, before.counters.malas + 1);
    assert.equal(after.counters.sadhanaTasks, before.counters.sadhanaTasks + 1);
    assert.equal(after.currentStreak, Math.max(before.currentStreak, guestStats.currentStreak));
    assert.deepEqual(
      [...after.badgeIds].sort(),
      [...new Set([...before.badgeIds, ...guestStats.badgeIds])].sort(),
    );
    // One entry per day and task; the visit and the XP of the day merged.
    const day = (await db.doc(`users/${account.uid}/days/${today}`).get()).data()!;
    assert.equal(day.tasks.prayer, true);
    assert.equal(day.mandirVisited, true);
    assert.deepEqual(day.mergedFrom, [guest.uid]);
    assert.equal((await db.doc(`users/${account.uid}/days/2026-01-02`).get()).get("tasks").jaap, true);
    // Ledger: the shared prayer task once, guest entries marked as merged.
    const merged = await ledger(account.uid);
    assert.equal(merged.filter((e) => e.type === "TASK" && e.sourceId === `prayer:${today}`).length, 1);
    assert.ok(merged.filter((e) => e.mergedFrom === guest.uid).every((e) => e.uid === account.uid));
    // Favorites united, profile kept.
    const favorites = await db.collection(`users/${account.uid}/favorites`).get();
    assert.deepEqual(favorites.docs.map((d) => d.id).sort(), ["aarti-1", "bhajan-1"]);
    const profile = (await db.doc(`users/${account.uid}`).get()).data()!;
    assert.equal(profile.displayName, "Account Name");
    assert.equal(profile.language, "hi");
    assert.equal(profile.isAnonymous, false);

    // Guest marked, Auth user gone, merge recorded and audited.
    assert.equal((await db.doc(`users/${guest.uid}`).get()).get("mergedInto"), account.uid);
    await assert.rejects(adminAuth.getUser(guest.uid));
    const record = (await db.doc(`accountMerges/${guest.uid}`).get()).data()!;
    assert.equal(record.status, "MERGED");
    assert.equal(record.targetUid, account.uid);
    assert.ok(record.cleanupAfter instanceof Timestamp);
    const audit = await db
      .collection("auditLogs")
      .where("entityId", "==", account.uid)
      .where("action", "==", "account.mergeGuest")
      .get();
    assert.equal(audit.size, 1);

    // A later retry returns the stored result and changes nothing.
    const again = await account.call<MergeSummary>("mergeGuestAccount", { guestIdToken });
    assert.deepEqual(again, { ...summary, alreadyMerged: true });
    assert.equal((await db.doc(`userStats/${account.uid}`).get()).get("totalXp"), after.totalXp);

    // Another account cannot take the same guest.
    const other = await client("other@example.com");
    await rejects(
      other.call("mergeGuestAccount", { guestIdToken }),
      "failed-precondition",
      "ALREADY_MERGED_ELSEWHERE",
    );

    // The daily cleanup removes the guest's documents, not the account's.
    await db.doc(`accountMerges/${guest.uid}`).update({ cleanupAfter: Timestamp.fromMillis(Date.now() - 1000) });
    const { cleanupMergedGuests } = await import("../src/accountMerge");
    assert.deepEqual(await cleanupMergedGuests(Timestamp.now(), { store: null }), { cleaned: 1 });
    assert.equal((await db.doc(`users/${guest.uid}`).get()).exists, false);
    assert.equal((await db.doc(`userStats/${guest.uid}`).get()).exists, false);
    assert.equal((await ledger(guest.uid)).length, 0);
    assert.equal((await ledger(account.uid)).length, merged.length);
    const cleaned = (await db.doc(`accountMerges/${guest.uid}`).get()).data()!;
    assert.equal(cleaned.cleanupAfter, undefined);
    assert.equal(cleaned.status, "MERGED");
  });

  test("refuses guests as callers, non-guest tokens and bad tokens", async () => {
    const guest = await client();
    const otherGuest = await client();
    const account = await client("refusals@example.com");
    await rejects(
      guest.call("mergeGuestAccount", { guestIdToken: await otherGuest.user.getIdToken() }),
      "permission-denied",
      "SIGN_IN_REQUIRED",
    );
    const other = await client("second@example.com");
    await rejects(
      account.call("mergeGuestAccount", { guestIdToken: await other.user.getIdToken() }),
      "failed-precondition",
      "GUEST_NOT_ANONYMOUS",
    );
    await rejects(
      account.call("mergeGuestAccount", { guestIdToken: await account.user.getIdToken() }),
      "failed-precondition",
      "GUEST_NOT_ANONYMOUS",
    );
    await rejects(
      account.call("mergeGuestAccount", { guestIdToken: "not-a-real-token-at-all-0123456789" }),
      "invalid-argument",
      "GUEST_TOKEN_INVALID",
    );
    await rejects(account.call("mergeGuestAccount", {}), "invalid-argument");
    // Nothing was claimed.
    assert.equal((await db.doc(`accountMerges/${otherGuest.uid}`).get()).exists, false);
  });
});
