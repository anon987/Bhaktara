import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { createFirestoreRepository } from "../src/repositories/firestoreRepository";
import { jsFirestoreApi } from "../src/services/firebase/jsFirestoreApi";
import { createSessionService } from "../src/services/auth/session";
import { seedEmulator } from "../scripts/emulator/seed";
import { projectId } from "../scripts/emulator/environment";

let env: RulesTestEnvironment;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  // This is the isolated demo project started by emulators:exec, never cloud data.
  await env.clearFirestore();
  await seedEmulator();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "alice"), {
      language: "hi",
      mandirDeityId: null,
      photoUrl: null,
      displayName: "Guest",
      timezone: "Asia/Kolkata",
      isAnonymous: true,
      notificationPreferences: {
        dailyReminder: false,
        reminderTime: "08:00",
        newContent: false,
        festivals: false,
        league: false,
      },
    });
    await setDoc(doc(db, "userStats", "alice"), { totalXp: 10 });
    await setDoc(doc(db, "leagueMembers", "week_alice"), {
      uid: "alice",
      weeklyXp: 10,
    });
    await setDoc(doc(db, "contentPrivate", "bhajan-1"), {
      sourceText: "private",
    });
  });
});
after(async () => {
  await env?.cleanup();
});
const guest = (uid = "alice") =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();

test("catalog requires auth, publication filters, and bounded queries", async () => {
  const db = guest();
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore(), "content", "bhajan-1"),
    ),
  );
  await assertSucceeds(getDoc(doc(db, "content", "bhajan-1")));
  await assertFails(getDoc(doc(db, "content", "private-draft")));
  await assertFails(getDocs(query(collection(db, "content"), limit(10))));
  await assertFails(
    getDocs(
      query(collection(db, "content"), where("status", "==", "PUBLISHED")),
    ),
  );
  await assertFails(
    getDocs(
      query(
        collection(db, "content"),
        where("status", "==", "PUBLISHED"),
        limit(31),
      ),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "content"),
        where("status", "==", "PUBLISHED"),
        limit(10),
      ),
    ),
  );
});

test("profile preferences are owner-only and cannot inject progression or privileges", async () => {
  await assertSucceeds(
    updateDoc(doc(guest(), "users", "alice"), { language: "en" }),
  );
  await assertFails(
    updateDoc(doc(guest("bob"), "users", "alice"), { language: "hi" }),
  );
  for (const value of [
    { totalXp: 999 },
    { isAdmin: true },
    { timezone: "UTC" },
    { displayName: "Unreviewed" },
    { language: "fr" },
    { notificationPreferences: { dailyReminder: "yes" } },
  ]) {
    await assertFails(updateDoc(doc(guest(), "users", "alice"), value));
  }
  await assertFails(
    setDoc(doc(guest(), "users", "new-user"), { language: "en" }),
  );
});

test("progression and sensitive documents reject direct client writes and cross-user reads", async () => {
  const db = guest();
  for (const path of [
    "userStats/alice",
    "entitlements/alice",
    "users/alice/days/2026-10-04",
    "users/alice/sessions/fake",
    "users/alice/badges/fake",
    "rewardTransactions/alice_fake",
    "accountMerges/alice",
    "leagueMembers/week_alice",
    "userChallenges/alice_fake",
    "content/fake",
    "appConfig/gamification",
  ]) {
    await assertFails(setDoc(doc(db, path), { totalXp: 999 }));
  }
  await assertSucceeds(getDoc(doc(db, "userStats", "alice")));
  await assertFails(getDoc(doc(guest("bob"), "userStats", "alice")));
  await assertFails(getDoc(doc(db, "contentPrivate", "bhajan-1")));
  await assertFails(getDoc(doc(db, "accountMerges", "alice")));
});

test("favorites must belong to the caller and match published content", async () => {
  const value = {
    contentId: "bhajan-1",
    type: "BHAJAN",
    createdAt: serverTimestamp(),
  };
  await assertSucceeds(
    setDoc(doc(guest(), "users/alice/favorites/bhajan-1"), value),
  );
  await assertFails(
    setDoc(doc(guest("bob"), "users/alice/favorites/bhajan-1"), value),
  );
  await assertFails(
    setDoc(doc(guest(), "users/alice/favorites/aarti-1"), value),
  );
  await assertFails(
    setDoc(doc(guest(), "users/alice/favorites/private-draft"), {
      ...value,
      contentId: "private-draft",
    }),
  );
});

test("anonymous users cannot read leagues; signed-in sessions can", async () => {
  await assertFails(getDoc(doc(guest(), "leagueMembers/week_alice")));
  const signed = env
    .authenticatedContext("signed", {
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  await assertSucceeds(getDoc(doc(signed, "leagueMembers/week_alice")));
  await assertFails(
    setDoc(doc(signed, "leagueMembers/week_alice"), { weeklyXp: 999 }),
  );
});

test("real anonymous auth drives validated catalog search and cursor pagination", async () => {
  const app = initializeApp(
    { projectId, apiKey: "demo-api-key", appId: "test" },
    "integration",
  );
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    let creations = 0;
    const session = createSessionService({
      ready: () => auth.authStateReady(),
      current: () => auth.currentUser,
      createAnonymous: async () => {
        creations++;
        return (await signInAnonymously(auth)).user;
      },
    });
    const [a, b] = await Promise.all([
      session.ensureSession(),
      session.ensureSession(),
    ]);
    assert.ok(a?.isAnonymous);
    assert.equal(a.uid, b?.uid);
    assert.equal(creations, 1);
    const repository = createFirestoreRepository(db, session, jsFirestoreApi);
    const catalog = await repository.getCatalog();
    assert.equal(catalog.deities.length, 5);
    assert.equal(catalog.banners.length, 2);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.search({ limit: 3, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 13);
    assert.equal(new Set(ids).size, 13);
    assert.ok(!ids.includes("private-draft"));
    assert.deepEqual(
      (
        await repository.search({
          query: "Hanumaan chalisa",
          type: "CHALISA",
          deityId: "hanuman",
        })
      ).items.map((item) => item.id),
      ["chalisa-1"],
    );
    assert.deepEqual(
      (await repository.search({ query: "हनुमान", type: "CHALISA" })).items.map(
        (item) => item.id,
      ),
      ["chalisa-1"],
    );
    // A lone first keystroke cannot match two-letter prefix tokens; it must
    // not narrow the library to nothing.
    assert.equal(
      (await repository.search({ query: "h", limit: 30 })).items.length,
      13,
    );
    // Empty filtered pages must still expose the server cursor to continue.
    const filtered = await repository.search({
      query: "aarti",
      deityId: "durga",
      limit: 1,
    });
    assert.equal(filtered.items.length, 0);
    assert.ok(filtered.nextCursor);
    assert.equal((await repository.getById("aarti-durga"))?.id, "aarti-durga");
    await assert.rejects(repository.getById("private-draft"));
    const page = await repository.search({ limit: 3 });
    await assert.rejects(
      repository.search({ query: "changed", cursor: page.nextCursor }),
    );
    assert.equal(creations, 1);
  } finally {
    await deleteApp(app);
  }
});
