// Integration tests for the habit-layer callables (doc 08 §2): practice
// sessions, the prayer checklist, timezone, the reward ledger, challenges,
// badges and the client rules for progression data. They run inside
// `npm run test:functions` (Auth, Firestore and Functions emulators).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initAdmin,
} from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp, FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDoc,
  getFirestore as getClientFirestore,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import type { PracticeResult } from "../../src/domain/progression";
import { bhaktiDayAt } from "../../src/domain/progression";
import { seedEmulator } from "../../scripts/emulator/seed";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "progression-test-admin");
const db = getFirestore(adminApp);
const clients: FirebaseApp[] = [];

type Player = {
  uid: string;
  firestore: Firestore;
  call: <T = PracticeResult>(name: string, data?: unknown) => Promise<T>;
};

async function guest(): Promise<Player> {
  const app = initializeApp(
    { projectId, apiKey: "demo-key" },
    `progression-client-${clients.length}`,
  );
  clients.push(app);
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  const firestore = getClientFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const { user } = await signInAnonymously(getAuth(app));
  return {
    uid: user.uid,
    firestore,
    call: async (name, data) =>
      (await httpsCallable(functions, name, { timeout: 60_000 })(data))
        .data as never,
  };
}

async function rejects(
  promise: Promise<unknown>,
  code: string,
  reason?: string,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FunctionsError, String(error));
    assert.equal(error.code, `functions/${code}`, error.message);
    if (reason)
      assert.equal((error.details as { reason?: string })?.reason, reason);
    return true;
  });
}

const sessionId = () => randomUUID().replaceAll("-", "");
// Sessions are timed by the server; tests move the start back instead of waiting.
const backdate = (uid: string, id: string, seconds: number) =>
  db
    .doc(`users/${uid}/sessions/${id}`)
    .update({ startedAt: Timestamp.fromMillis(Date.now() - seconds * 1000) });

async function chantMala(player: Player, malas = 1) {
  const id = sessionId();
  await player.call("startSession", { sessionId: id, type: "JAAP" });
  await backdate(player.uid, id, 61 * malas);
  return {
    id,
    result: await player.call("completeSession", {
      sessionId: id,
      malasCompleted: malas,
    }),
  };
}

const ledger = async (uid: string) =>
  (
    await db.collection("rewardTransactions").where("uid", "==", uid).get()
  ).docs.map((d) => d.data());
const stats = async (uid: string) =>
  (await db.doc(`userStats/${uid}`).get()).data()!;

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

describe("setTimezone", () => {
  test("creates the profile and limits changes to one per day", async () => {
    const player = await guest();
    const first = await player.call<{ timezone: string; changed: boolean }>(
      "setTimezone",
      { timezone: "Asia/Kolkata", language: "hi" },
    );
    assert.deepEqual([first.timezone, first.changed], ["Asia/Kolkata", true]);
    const profile = (await db.doc(`users/${player.uid}`).get()).data()!;
    assert.equal(profile.isAnonymous, true);
    assert.equal(profile.language, "hi");
    assert.equal(profile.notificationPreferences.reminderTime, "07:00");
    // The first change after creation is accepted, the next one within 24 h not.
    const moved = await player.call<{ timezone: string; changed: boolean }>(
      "setTimezone",
      { timezone: "Asia/Dubai" },
    );
    assert.equal(moved.timezone, "Asia/Dubai");
    const refused = await player.call<{ timezone: string; reason?: string }>(
      "setTimezone",
      { timezone: "Europe/London" },
    );
    assert.equal(refused.timezone, "Asia/Dubai");
    assert.equal(refused.reason, "TIMEZONE_CHANGE_LIMIT");
    await rejects(
      player.call("setTimezone", { timezone: "Mars/Base" }),
      "invalid-argument",
    );
    // The created profile satisfies the owner-update rule.
    await updateDoc(doc(player.firestore, "users", player.uid), {
      language: "en",
    });
  });
});

describe("practice sessions", () => {
  test("a mala pays XP once, extends the streak and unlocks first badges", async () => {
    const player = await guest();
    const { id, result } = await chantMala(player);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.malasCredited, 1);
    assert.equal(result.currentStreak, 1);
    assert.equal(result.tasks.jaap, true);
    assert.deepEqual(result.badgesUnlocked.map((b) => b.id).sort(), [
      "pehli-mala",
      "pehli-sadhana",
    ]);
    // 15 (mala) + 10 (task) + 10 + 10 (badges).
    assert.equal(result.xpGranted, 45);
    assert.equal(result.totalXp, 45);
    // A retry returns the stored result and pays nothing more.
    const retry = await player.call("completeSession", {
      sessionId: id,
      malasCompleted: 1,
    });
    assert.deepEqual(retry, result);
    assert.equal((await stats(player.uid)).totalXp, 45);
    assert.equal((await ledger(player.uid)).length, 4);
    const day = (
      await db.doc(`users/${player.uid}/days/${result.bhaktiDay}`).get()
    ).data()!;
    assert.equal(day.malas, 1);
    assert.equal(day.qualifying, true);
  });

  test("starting is idempotent and a fast mala is rejected", async () => {
    const player = await guest();
    const id = sessionId();
    const first = await player.call<{ startedAt: number }>("startSession", {
      sessionId: id,
      type: "JAAP",
    });
    const again = await player.call<{ startedAt: number }>("startSession", {
      sessionId: id,
      type: "JAAP",
    });
    assert.equal(again.startedAt, first.startedAt);
    await rejects(
      player.call("startSession", { sessionId: id, type: "MEDITATION" }),
      "invalid-argument",
      "SESSION_TYPE_MISMATCH",
    );
    await rejects(
      player.call("completeSession", { sessionId: id, malasCompleted: 1 }),
      "failed-precondition",
      "SESSION_TOO_SHORT",
    );
    // The rejection is final, also on retry.
    await backdate(player.uid, id, 120);
    await rejects(
      player.call("completeSession", { sessionId: id, malasCompleted: 1 }),
      "failed-precondition",
      "SESSION_TOO_SHORT",
    );
    assert.deepEqual(await ledger(player.uid), []);
  });

  test("only the latest session of a type can complete", async () => {
    const player = await guest();
    const older = sessionId();
    await player.call("startSession", { sessionId: older, type: "JAAP" });
    await backdate(player.uid, older, 120);
    const { result } = await chantMala(player);
    assert.equal(result.malasCredited, 1);
    await rejects(
      player.call("completeSession", { sessionId: older, malasCompleted: 1 }),
      "failed-precondition",
      "SESSION_SUPERSEDED",
    );
  });

  test("parallel completions of one session pay once", async () => {
    const player = await guest();
    const id = sessionId();
    await player.call("startSession", { sessionId: id, type: "JAAP" });
    await backdate(player.uid, id, 200);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        player.call("completeSession", { sessionId: id, malasCompleted: 3 }),
      ),
    );
    assert.ok(results.every((r) => r.totalXp === results[0].totalXp));
    const s = await stats(player.uid);
    assert.equal(s.counters.malas, 3);
    assert.equal(s.totalXp, results[0].totalXp);
    const lines = await ledger(player.uid);
    assert.equal(
      new Set(lines.map((l) => `${l.type}:${l.sourceId}`)).size,
      lines.length,
    );
  });

  test("meditation credits no more minutes than the session ran", async () => {
    const player = await guest();
    const id = sessionId();
    await player.call("startSession", {
      sessionId: id,
      type: "MEDITATION",
      targetMinutes: 10,
    });
    await backdate(player.uid, id, 6 * 60);
    const result = await player.call("completeSession", {
      sessionId: id,
      minutesCompleted: 10,
    });
    assert.equal(result.minutesCredited, 6);
    assert.equal(result.tasks.meditation, true);
    assert.ok(
      result.rewards.some((r) => r.type === "MEDITATION" && r.xp === 10),
    );
    await rejects(
      player.call("completeSession", {
        sessionId: sessionId(),
        minutesCompleted: 5,
      }),
      "not-found",
    );
  });
});

describe("prayer checklist and full Sadhana", () => {
  test("needs every step, pays once and completes the day with the other tasks", async () => {
    const player = await guest();
    await rejects(
      player.call("completePrayerChecklist", { itemIds: ["pushp"] }),
      "invalid-argument",
      "CHECKLIST_INCOMPLETE",
    );
    await chantMala(player);
    const id = sessionId();
    await player.call("startSession", { sessionId: id, type: "MEDITATION" });
    await backdate(player.uid, id, 5 * 60);
    await player.call("completeSession", {
      sessionId: id,
      minutesCompleted: 5,
    });
    const today = bhaktiDayAt(new Date(), "Asia/Kolkata");
    const prayer = await player.call("completePrayerChecklist", {
      bhaktiDay: today,
      itemIds: ["pushp", "dhoop", "naivedya", "deep", "shankh"],
    });
    assert.equal(prayer.fullSadhana, true);
    assert.ok(
      prayer.rewards.some((r) => r.type === "FULL_SADHANA" && r.xp === 20),
    );
    const again = await player.call("completePrayerChecklist", {
      itemIds: ["pushp", "dhoop", "naivedya", "deep", "shankh"],
    });
    assert.equal(again.status, "ALREADY_DONE");
    assert.equal(again.totalXp, prayer.totalXp);
  });
});

describe("challenges and the daily cap", () => {
  test("a daily challenge completes once and the cap holds", async () => {
    const player = await guest();
    const { result } = await chantMala(player, 2);
    assert.deepEqual(
      result.challengesCompleted.map((c) => c.id),
      ["dev-daily-2-mala"],
    );
    const key = `${player.uid}_dev-daily-2-mala_day-${result.bhaktiDay}`;
    const progress = (await db.doc(`userChallenges/${key}`).get()).data()!;
    assert.equal(progress.status, "COMPLETED");
    // Lower the cap and chant more: XP beyond it is logged as CAPPED.
    await db
      .doc("appConfig/gamification")
      .update({ "limits.dailyXpCap": result.totalXp + 5 });
    try {
      const { result: more } = await chantMala(player);
      assert.equal(more.xpGranted, 5);
      assert.equal(more.capped, true);
      const capped = (await ledger(player.uid)).filter(
        (l) => l.status === "CAPPED",
      );
      assert.ok(capped.length >= 1);
    } finally {
      await db
        .doc("appConfig/gamification")
        .update({ "limits.dailyXpCap": 300 });
    }
  });

  test("expireChallenges closes ended periods only", async () => {
    const { expireChallenges } = await import("../src/progression");
    const past = Timestamp.fromMillis(Date.now() - 60_000);
    const future = Timestamp.fromMillis(Date.now() + 3_600_000);
    await db
      .doc("userChallenges/x_old_day-1")
      .set({ uid: "x", status: "ACTIVE", expiresAt: past });
    await db
      .doc("userChallenges/x_new_day-2")
      .set({ uid: "x", status: "ACTIVE", expiresAt: future });
    const result = await expireChallenges();
    assert.ok(result.expired >= 1);
    assert.equal(
      (await db.doc("userChallenges/x_old_day-1").get()).get("status"),
      "EXPIRED",
    );
    assert.equal(
      (await db.doc("userChallenges/x_new_day-2").get()).get("status"),
      "ACTIVE",
    );
  });
});

describe("client rules for progression data", () => {
  test("owners read their own progress; nobody writes it or reads the ledger", async () => {
    const player = await guest();
    const other = await guest();
    const { result } = await chantMala(player);
    const f = player.firestore;
    assert.equal(
      (await getDoc(doc(f, "userStats", player.uid))).get("totalXp"),
      result.totalXp,
    );
    assert.ok(
      (
        await getDoc(doc(f, "users", player.uid, "days", result.bhaktiDay))
      ).exists(),
    );
    // A challenge the player has not started reads as absent, not denied.
    const unstarted = await getDoc(
      doc(f, "userChallenges", `${player.uid}_dev-weekly-5-poorna_week-x`),
    );
    assert.equal(unstarted.exists(), false);
    assert.ok((await getDoc(doc(f, "appConfig", "gamification"))).exists());
    assert.ok((await getDoc(doc(f, "badges", "pehli-mala"))).exists());
    const denied = async (run: Promise<unknown>) =>
      assert.rejects(
        run,
        (e: { code?: string }) => e.code === "permission-denied",
      );
    await denied(getDoc(doc(other.firestore, "userStats", player.uid)));
    await denied(
      getDoc(
        doc(
          other.firestore,
          "userChallenges",
          `${player.uid}_dev-daily-2-mala_day-x`,
        ),
      ),
    );
    await denied(setDoc(doc(f, "userStats", player.uid), { totalXp: 99999 }));
    await denied(
      setDoc(doc(f, "users", player.uid, "days", "2026-01-01"), {
        qualifying: true,
      }),
    );
    await denied(getDoc(doc(f, "rewardTransactions", `${player.uid}_MALA_x`)));
    await denied(getDoc(doc(f, "appConfig", "notifications")));
  });
});
