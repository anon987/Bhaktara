// Unit tests for the profile and account rules (doc 21, D-042): the name
// filter, photo keys and uploads, and the guest → account merge rules. Pure:
// no emulator, network or R2 (fakes stand in for the store and Auth).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  displayNameSchema,
  mergeGuestAccountSchema,
  PROFILE_PHOTO_MAX_BYTES,
  requestProfilePhotoUploadSchema,
  updateProfileSchema,
} from "../../../src/domain/account";
import {
  defaultGamificationConfig as config,
  emptyCounters,
  levelForXp,
} from "../../../src/domain/progression";
import { MergeAuth, mergeGuestAccount, verifyGuestToken } from "../../src/accountMerge";
import {
  countLedgerEntry,
  emptyMergeProgress,
  ledgerEntryFor,
  mergeChallenge,
  mergeDay,
  mergeStats,
  mergeStreaks,
  normalizeProgress,
  profileFallbacks,
} from "../../src/mergeRules";
import { foldForMatching, isNameBlocked } from "../../src/profanity";
import {
  buildPhotoUploadSlot,
  checkDisplayName,
  normalizeDisplayName,
  PHOTO_CACHE_CONTROL,
  PhotoStore,
  photoKeyExt,
  sniffImage,
  verifyPhotoUpload,
} from "../../src/profile";
import { normalizeStats } from "../../src/progressionEngine";

function refused(error: unknown, code: string, reason: string) {
  assert.ok(error instanceof HttpsError, String(error));
  assert.equal(error.code, code);
  assert.equal((error.details as { reason?: string }).reason, reason);
  return true;
}

// ---- Names --------------------------------------------------------------------

test("the name rule accepts names in any script and refuses the rest", () => {
  for (const name of ["Ram", "राम कुमार", "Sita D.", "O'Brien", "Anne-Marie", "ராமன்", "Jo"])
    assert.ok(displayNameSchema.safeParse(name).success, name);
  for (const name of ["R", "x".repeat(31), "Ram123", "🙏 Ram", "-Ram", "Ram!", "   "])
    assert.ok(!displayNameSchema.safeParse(name).success, name);
  // Trimmed before the length check.
  assert.equal(displayNameSchema.parse("  Ram  "), "Ram");
  assert.equal(normalizeDisplayName("Ram \t\n  Kumar"), "Ram Kumar");
  assert.equal(normalizeDisplayName("Ramé"), "Ramé");
});

test("the filter blocks English, Hindi and Hinglish abuse in any case or spelling", () => {
  for (const name of [
    "Fuck",
    "FUCKER Ji",
    "fuuuck",
    "Fück",
    "f u c k",
    "Mother-fucker",
    "Bitch",
    "shit",
    "madarchod",
    "MaderChod",
    "Behen-chod",
    "Bhosdike",
    "chutiya",
    "Gaandu",
    "gandu",
    "Harami",
    "kamine",
    "Lund",
    "मादरचोद",
    "बहनचोद",
    "चूतिया",
    "चुतिया",
    "हरामी",
    "भोसड़ीके",
    "रंडी",
    "गांडू",
    // Cyrillic look-alikes (а, с, о).
    "fuсk",
    "Bhaktara Official",
    "Admin",
    "भक्तारा",
  ])
    assert.ok(isNameBlocked(name), `${name} should be blocked`);
});

test("the filter leaves real names alone", () => {
  for (const name of [
    "Mohandas Gandhi",
    "Shitala Mata",
    "Harshita",
    "Bob",
    "Dickens",
    "Pornima",
    "Hassan",
    "Kamini",
    "Randhir",
    "Chutki",
    "Scunthorpe",
    "Lakshmi Devi",
    "राम कुमार",
    "सीता",
    "गांधी",
    "श्याम सुंदर",
    "Assam Wale",
  ])
    assert.ok(!isNameBlocked(name), `${name} should be allowed`);
});

test("folding removes case, accents, matras and look-alikes", () => {
  assert.equal(foldForMatching("FÜCK"), "fuck");
  assert.equal(foldForMatching("chutiyа"), "chutiya"); // Cyrillic а
  assert.equal(foldForMatching("चूतिया"), foldForMatching("चुतिया"));
});

test("a blocked name is refused with DISPLAY_NAME_NOT_ALLOWED", () => {
  assert.throws(
    () => checkDisplayName("Ram  Madarchod"),
    (error) => refused(error, "invalid-argument", "DISPLAY_NAME_NOT_ALLOWED"),
  );
  assert.equal(checkDisplayName("Ram   Kumar"), "Ram Kumar");
});

test("updateProfile needs a change and accepts only name and photo", () => {
  assert.ok(!updateProfileSchema.safeParse({}).success);
  assert.ok(!updateProfileSchema.safeParse({ displayName: "Ram", language: "hi" }).success);
  assert.ok(updateProfileSchema.safeParse({ photoKey: null }).success);
  assert.ok(updateProfileSchema.safeParse({ displayName: "Ram", photoKey: "users/u/photo.a.jpg" }).success);
  assert.ok(!updateProfileSchema.safeParse({ photoKey: "https://x.test/a.jpg" }).success);
});

// ---- Photos -------------------------------------------------------------------

test("photo keys must be the user's own, in the handed-out shape", () => {
  assert.equal(photoKeyExt("u1", "users/u1/photo.0123456789abcdef.jpg"), "jpg");
  assert.equal(photoKeyExt("u1", "users/u1/photo.0123456789abcdef.webp"), "webp");
  for (const key of [
    "users/u2/photo.0123456789abcdef.jpg",
    "users/u1x/photo.0123456789abcdef.jpg",
    "users/u1/photo.0123456789ABCDEF.jpg",
    "users/u1/photo.0123456789abcdef.png",
    "users/u1/photo.0123456789abcdef.jpg/../../x.jpg",
    "users/u1/avatar.0123456789abcdef.jpg",
    "staging/u1/photo.0123456789abcdef.jpg",
    "users/u1/photo.short.jpg",
  ])
    assert.equal(photoKeyExt("u1", key), null, key);
});

test("image sniffing knows JPEG and WebP only", () => {
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.equal(sniffImage(webp), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<html><body>")), null);
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null);
});

const jpegStart = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
function fakeStore(object: { bytes: number; contentType: string | null; start: Uint8Array } | null) {
  const removed: string[] = [];
  const store: PhotoStore = {
    head: async () => object && { bytes: object.bytes, contentType: object.contentType },
    readStart: async (_key, bytes) => (object?.start ?? new Uint8Array()).slice(0, bytes),
    remove: async (key) => {
      removed.push(key);
    },
  };
  return { store, removed };
}

test("an uploaded photo is checked for owner, presence, size and type", async () => {
  const key = "users/u1/photo.0123456789abcdef.jpg";
  const ok = fakeStore({ bytes: 5000, contentType: "image/jpeg", start: jpegStart });
  assert.deepEqual(await verifyPhotoUpload("u1", key, ok.store), {
    bytes: 5000,
    contentType: "image/jpeg",
  });
  const cases: [string, PhotoStore | null, string, string][] = [
    ["users/u2/photo.0123456789abcdef.jpg", ok.store, "invalid-argument", "PHOTO_KEY_INVALID"],
    [key, null, "failed-precondition", "UPLOADS_NOT_CONFIGURED"],
    [key, fakeStore(null).store, "failed-precondition", "PHOTO_NOT_UPLOADED"],
    [
      key,
      fakeStore({ bytes: PROFILE_PHOTO_MAX_BYTES + 1, contentType: "image/jpeg", start: jpegStart }).store,
      "invalid-argument",
      "PHOTO_TOO_LARGE",
    ],
    [
      key,
      fakeStore({ bytes: 5000, contentType: "text/html", start: jpegStart }).store,
      "invalid-argument",
      "PHOTO_TYPE_INVALID",
    ],
    [
      key,
      fakeStore({ bytes: 5000, contentType: "image/jpeg", start: new TextEncoder().encode("<html>") }).store,
      "invalid-argument",
      "PHOTO_TYPE_INVALID",
    ],
    [
      "users/u1/photo.0123456789abcdef.webp",
      ok.store,
      "invalid-argument",
      "PHOTO_TYPE_INVALID",
    ],
  ];
  for (const [badKey, store, code, reason] of cases)
    await assert.rejects(verifyPhotoUpload("u1", badKey, store), (error) =>
      refused(error, code, reason),
    );
});

test("the upload slot binds key, type, size and caching, for 10 minutes", async () => {
  const calls: unknown[] = [];
  const now = new Date("2026-10-14T10:00:00Z");
  const slot = await buildPhotoUploadSlot(
    "u1",
    { contentType: "image/webp", bytes: 40_000 },
    {
      presign: async (input) => {
        calls.push(input);
        return "https://r2.test/signed";
      },
      bucket: "media",
      now,
      id: "00112233aabbccdd",
    },
  );
  assert.deepEqual(slot, {
    key: "users/u1/photo.00112233aabbccdd.webp",
    uploadUrl: "https://r2.test/signed",
    headers: { "Content-Type": "image/webp", "Cache-Control": PHOTO_CACHE_CONTROL },
    expiresAt: "2026-10-14T10:10:00.000Z",
  });
  assert.deepEqual(calls, [
    {
      bucket: "media",
      key: "users/u1/photo.00112233aabbccdd.webp",
      contentType: "image/webp",
      bytes: 40_000,
      expiresIn: 600,
      cacheControl: PHOTO_CACHE_CONTROL,
    },
  ]);
  assert.equal(photoKeyExt("u1", slot.key), "webp");
  // A random key per upload.
  const other = await buildPhotoUploadSlot(
    "u1",
    { contentType: "image/jpeg", bytes: 1 },
    { presign: async () => "x", bucket: "media", now },
  );
  assert.equal(photoKeyExt("u1", other.key), "jpg");
  assert.notEqual(other.key, slot.key);
});

test("upload requests are limited to JPEG/WebP up to 1 MB", () => {
  assert.ok(requestProfilePhotoUploadSchema.safeParse({ contentType: "image/jpeg", bytes: 1 }).success);
  for (const value of [
    { contentType: "image/png", bytes: 10 },
    { contentType: "image/jpeg", bytes: PROFILE_PHOTO_MAX_BYTES + 1 },
    { contentType: "image/jpeg", bytes: 0 },
    { contentType: "image/jpeg", bytes: 10, key: "users/x/photo.a.jpg" },
  ])
    assert.ok(!requestProfilePhotoUploadSchema.safeParse(value).success, JSON.stringify(value));
});

// ---- Merge: caller and token --------------------------------------------------------

const token = (uid: string, provider: string) =>
  ({ uid, firebase: { sign_in_provider: provider } }) as unknown as DecodedIdToken;
function fakeAuth(result: DecodedIdToken | { code: string }): MergeAuth {
  return {
    verifyIdToken: async () => {
      if ("code" in result) throw Object.assign(new Error(result.code), result);
      return result;
    },
    getUser: async () => ({ isAnonymous: true }),
    deleteUser: async () => undefined,
  };
}

test("only a verified anonymous guest token of another UID is accepted", async () => {
  const raw = "x".repeat(40);
  assert.equal(await verifyGuestToken(fakeAuth(token("guest1", "anonymous")), raw, "acct"), "guest1");
  const cases: [MergeAuth, string, string][] = [
    [fakeAuth(token("other", "google.com")), "failed-precondition", "GUEST_NOT_ANONYMOUS"],
    [fakeAuth(token("acct", "anonymous")), "invalid-argument", "SAME_ACCOUNT"],
    [fakeAuth({ code: "auth/id-token-expired" }), "invalid-argument", "GUEST_TOKEN_EXPIRED"],
    [fakeAuth({ code: "auth/argument-error" }), "invalid-argument", "GUEST_TOKEN_INVALID"],
  ];
  for (const [auth, code, reason] of cases)
    await assert.rejects(verifyGuestToken(auth, raw, "acct"), (error) => refused(error, code, reason));
  // A verified token whose guest is already deleted (the emulator checks the
  // user after the signature): its payload still names the guest.
  const jwt = (payload: object) =>
    `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
  const gone = fakeAuth({ code: "auth/user-not-found" });
  assert.equal(
    await verifyGuestToken(gone, jwt({ sub: "g9", firebase: { sign_in_provider: "anonymous" } }), "acct"),
    "g9",
  );
  await assert.rejects(
    verifyGuestToken(gone, jwt({ sub: "g9", firebase: { sign_in_provider: "google.com" } }), "acct"),
    (error) => refused(error, "failed-precondition", "GUEST_NOT_ANONYMOUS"),
  );
  await assert.rejects(verifyGuestToken(gone, raw, "acct"), (error) =>
    refused(error, "invalid-argument", "GUEST_TOKEN_INVALID"),
  );
  assert.ok(!mergeGuestAccountSchema.safeParse({ guestIdToken: "short" }).success);
  assert.ok(!mergeGuestAccountSchema.safeParse({ guestIdToken: raw, guestUid: "g" }).success);
});

test("a guest cannot merge into a guest", async () => {
  await assert.rejects(
    mergeGuestAccount({ uid: "g2", isAnonymous: true }, { guestIdToken: "x".repeat(40) }, {
      auth: fakeAuth(token("g1", "anonymous")),
    }),
    (error) => refused(error, "permission-denied", "SIGN_IN_REQUIRED"),
  );
});

// ---- Merge: data rules ----------------------------------------------------------------

test("ledger copies keep type, source and day and count toward XP once", () => {
  const progress = emptyMergeProgress();
  const guestEntry = {
    uid: "g",
    type: "TASK",
    sourceId: "jaap:2026-10-10",
    xp: 10,
    requestedXp: 10,
    status: "GRANTED",
    bhaktiDay: "2026-10-10",
  };
  const entry = ledgerEntryFor(guestEntry, "acct", "g", "now");
  assert.deepEqual(entry, { ...guestEntry, uid: "acct", mergedFrom: "g", mergedAt: "now" });
  countLedgerEntry(progress, entry);
  countLedgerEntry(progress, { ...entry, sourceId: "x", xp: 0, status: "CAPPED" });
  assert.equal(progress.xpAdded, 10);
  assert.equal(progress.ledgerAdded, 2);
  assert.deepEqual(progress.xpByDay, { "2026-10-10": 10 });
  // Survives the round trip through Firestore.
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(progress))), progress);
});

const day = (fields: Record<string, unknown>) => ({
  qualifying: true,
  xp: 0,
  tasks: { jaap: false, meditation: false, prayer: false },
  fullSadhana: false,
  malas: 0,
  malasRewarded: 0,
  meditationMinutes: 0,
  meditationSessionsRewarded: 0,
  mandirVisited: false,
  brahmaMuhurta: false,
  ...fields,
});

test("a guest-only day is added with its counters", () => {
  const merged = mergeDay(
    undefined,
    day({ tasks: { jaap: true, meditation: false, prayer: true }, malas: 3, mandirVisited: true, mandirDeityId: "shiva" }),
    25,
  );
  assert.equal(merged.added, true);
  assert.equal(merged.doc.xp, 25);
  assert.equal(merged.doc.mandirDeityId, "shiva");
  assert.deepEqual(merged.counters, {
    ...emptyCounters(),
    sadhanaTasks: 2,
    malas: 3,
    mandirVisits: 1,
  });
});

test("a day on both sides keeps one entry per task", () => {
  const merged = mergeDay(
    day({ tasks: { jaap: true, meditation: true, prayer: false }, xp: 30, malas: 2, mandirVisited: true }),
    day({ tasks: { jaap: true, meditation: false, prayer: true }, xp: 20, malas: 1, mandirVisited: true }),
    10,
  );
  assert.equal(merged.added, false);
  assert.deepEqual(merged.doc.tasks, { jaap: true, meditation: true, prayer: true });
  assert.equal(merged.doc.fullSadhana, true);
  assert.equal(merged.doc.xp, 40);
  assert.equal(merged.doc.malas, 3);
  assert.equal(merged.doc.mandirVisited, true);
  // Only the prayer task, the full Sadhana and the extra mala are new.
  assert.deepEqual(merged.counters, {
    ...emptyCounters(),
    sadhanaTasks: 1,
    fullSadhanaDays: 1,
    malas: 1,
  });
});

test("challenges keep the higher progress and are completed (and paid) once", () => {
  const base = {
    uid: "g",
    challengeId: "c1",
    period: "DAILY",
    periodKey: "day-2026-10-10",
    metric: "JAAP_MALAS",
    target: 5,
    expiresAt: "e",
  };
  // Guest only: copied to the account.
  const copied = mergeChallenge(undefined, { ...base, progress: 5, status: "COMPLETED", rewarded: true }, "acct");
  assert.equal(copied.doc.uid, "acct");
  assert.equal(copied.completed, true);
  // Both active: max progress.
  const active = mergeChallenge(
    { ...base, uid: "acct", progress: 2, status: "ACTIVE", rewarded: false },
    { ...base, progress: 4, status: "ACTIVE", rewarded: false },
    "acct",
  );
  assert.deepEqual(active.doc, { progress: 4, status: "ACTIVE", rewarded: false });
  assert.equal(active.completed, false);
  // The guest completed it: completed once, earliest completion kept.
  const at = (ms: number) => ({ toMillis: () => ms });
  const done = mergeChallenge(
    { ...base, uid: "acct", progress: 3, status: "ACTIVE", rewarded: false },
    { ...base, progress: 5, status: "COMPLETED", rewarded: true, completedAt: at(5) },
    "acct",
  );
  assert.equal(done.doc.status, "COMPLETED");
  assert.equal(done.doc.rewarded, true);
  assert.equal(done.completed, true);
  // Both completed: no new completion (the ledger dedupes the reward).
  const both = mergeChallenge(
    { ...base, uid: "acct", progress: 5, status: "COMPLETED", rewarded: true, completedAt: at(9) },
    { ...base, progress: 5, status: "COMPLETED", rewarded: true, completedAt: at(5) },
    "acct",
  );
  assert.equal(both.completed, false);
  assert.equal((both.doc.completedAt as { toMillis(): number }).toMillis(), 5);
});

test("streaks take the max without reviving a lapsed streak", () => {
  const s = (currentStreak: number, longestStreak: number, lastQualifyingDay: string | null) => ({
    currentStreak,
    longestStreak,
    lastQualifyingDay,
  });
  assert.deepEqual(mergeStreaks(s(3, 9, "2026-10-13"), s(5, 5, "2026-10-14")), s(5, 9, "2026-10-14"));
  assert.deepEqual(mergeStreaks(s(8, 8, "2026-10-13"), s(2, 4, "2026-10-14")), s(8, 8, "2026-10-14"));
  // The account's 20-day streak ended in September: the guest's run counts.
  assert.deepEqual(mergeStreaks(s(20, 20, "2026-09-01"), s(2, 2, "2026-10-14")), s(2, 20, "2026-10-14"));
  assert.deepEqual(mergeStreaks(s(0, 0, null), s(0, 0, null)), s(0, 0, null));
  assert.deepEqual(mergeStreaks(s(4, 6, "2026-10-01"), s(0, 0, null)), s(4, 6, "2026-10-01"));
});

test("stats add the ledger XP, recompute the level and keep the account's league", () => {
  const account = normalizeStats(
    {
      totalXp: 100,
      currentStreak: 2,
      longestStreak: 2,
      lastQualifyingDay: "2026-10-14",
      dailyXp: { day: "2026-10-14", xp: 40 },
      counters: { malas: 10, mandirVisits: 3 },
      badgeIds: ["first-mala"],
      leagueTier: "SILVER",
    },
    config,
  );
  const guest = normalizeStats(
    {
      totalXp: 400,
      currentStreak: 6,
      longestStreak: 6,
      lastQualifyingDay: "2026-10-14",
      badgeIds: ["first-mala", "streak-3"],
      flags: { suspicious: true, reason: "MALAS_PER_HOUR" },
    },
    config,
  );
  const progress = emptyMergeProgress();
  progress.xpAdded = 380;
  progress.xpByDay = { "2026-10-14": 25, "2026-10-12": 50 };
  progress.counters.malas = 7;
  progress.counters.mandirVisits = 1;
  progress.badgeIds = ["streak-3"];
  const merged = mergeStats(account, guest, progress, config);
  assert.equal(merged.totalXp, 480);
  assert.equal(merged.level, levelForXp(480, config));
  assert.equal(merged.currentStreak, 6);
  assert.equal(merged.counters.malas, 17);
  assert.equal(merged.counters.mandirVisits, 4);
  assert.deepEqual(merged.badgeIds, ["first-mala", "streak-3"]);
  assert.deepEqual(merged.dailyXp, { day: "2026-10-14", xp: 65 });
  assert.equal(merged.leagueTier, "SILVER");
  assert.deepEqual(merged.flags, { suspicious: true, reason: "GUEST_MALAS_PER_HOUR" });
  // The input is not changed.
  assert.equal(account.totalXp, 100);
});

test("the account keeps its profile; the guest's language fills a gap only", () => {
  assert.deepEqual(profileFallbacks({ language: "en", mandirDeityId: "ram" }, { language: "hi", mandirDeityId: "shiva" }), {});
  assert.deepEqual(profileFallbacks({ mandirDeityId: null }, { language: "en", mandirDeityId: "shiva" }), {
    language: "en",
    mandirDeityId: "shiva",
  });
  assert.deepEqual(profileFallbacks({}, { displayName: "Guest", photoKey: "users/g/photo.x.jpg" }), {});
});
