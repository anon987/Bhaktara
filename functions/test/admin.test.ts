// Integration tests for the admin panel v2 callables (dashboard, catalogue,
// versioned config, users, staff, asset library). They run inside
// `npm run test:functions`, against the Auth, Firestore and Functions
// emulators for the isolated demo-bhaktara project (never cloud data).
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
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { defaultGamificationConfig } from "../../src/domain/progression";
import { offeringsFor } from "../../src/domain/puja";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "admin-test-admin");
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clients: FirebaseApp[] = [];

type Caller = <T = unknown>(name: string, data?: unknown) => Promise<T>;
const roles = [
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "EDITOR",
  "ANALYST",
  "MODERATOR",
] as const;
const staff = {} as Record<(typeof roles)[number], { uid: string; call: Caller }>;
let signedOut: Caller;

async function client(email?: string) {
  const app = initializeApp(
    { projectId, apiKey: "demo-key" },
    `admin-client-${clients.length}`,
  );
  clients.push(app);
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const credential = email
    ? await signInWithEmailAndPassword(getAuth(app), email, "password-123")
    : null;
  const call: Caller = async (name, data) =>
    (await httpsCallable(functions, name, { timeout: 60_000 })(data))
      .data as never;
  return { uid: credential?.user.uid ?? "", call };
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

async function auditActions(entityId: string) {
  const snapshot = await db
    .collection("auditLogs")
    .where("entityId", "==", entityId)
    .get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    .map((entry) => entry.action as string);
}

// Two app devotees: a guest and a signed-in account with a sign-in record.
const devotee = { uid: "devotee-radha", email: "radha@devotee.test" };
const guest = { uid: "guest-shyam" };
const hoursAgo = (hours: number) =>
  Timestamp.fromMillis(Date.now() - hours * 3_600_000);

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
  ])
    assert.ok((await fetch(url, { method: "DELETE" })).ok);
  for (const role of roles) {
    const email = `${role.toLowerCase()}@admin.test`;
    const user = await adminAuth.createUser({ email, password: "password-123" });
    await adminAuth.setCustomUserClaims(user.uid, { role });
    staff[role] = await client(email);
  }
  signedOut = (await client()).call;

  await adminAuth.createUser({ uid: devotee.uid, email: devotee.email, password: "password-123" });
  await db.doc(`users/${devotee.uid}`).set({
    displayName: "Radha Devi",
    isAnonymous: false,
    language: "hi",
    createdAt: hoursAgo(30),
    lastActiveAt: hoursAgo(2),
  });
  await db.doc(`users/${devotee.uid}/days/2026-10-05`).set({ day: "2026-10-05", qualifying: true });
  await db.doc(`userStats/${devotee.uid}`).set({ totalXp: 340, level: 3, currentStreak: 4 });
  await db.doc(`userChallenges/${devotee.uid}_weekly`).set({ uid: devotee.uid, status: "ACTIVE" });
  await db.doc("rewardTransactions/ledger-1").set({ uid: devotee.uid, xp: 10, bhaktiDay: "2026-10-05" });
  await db.doc(`users/${guest.uid}`).set({
    displayName: null,
    isAnonymous: true,
    createdAt: hoursAgo(24 * 40),
  });

  // Warm each callable up: the emulator starts a worker on first use.
  for (const name of [
    "getDashboard",
    "saveCatalogItem",
    "deleteCatalogItem",
    "saveConfig",
    "rollbackConfig",
    "searchUsers",
    "getUserDetail",
    "moderateUser",
    "setUserDisabled",
    "deleteUserAccount",
    "listAdmins",
    "requestAssetUpload",
    "deleteAsset",
  ])
    for (let attempt = 1; ; attempt++) {
      const code = await signedOut(name).then(
        () => "ok",
        (error: { code?: string }) => error.code,
      );
      if (code === "functions/unauthenticated") break;
      if (attempt === 5) assert.fail(`${name} did not start: ${code}`);
    }
});

after(async () => {
  await Promise.all(clients.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

describe("permissions", () => {
  test("each role reaches only its own panel areas", async () => {
    await rejects(signedOut("getDashboard", {}), "unauthenticated");
    // Everyone on staff sees the dashboard.
    for (const role of roles) await staff[role].call("getDashboard", {});
    const category = {
      kind: "category",
      create: true,
      data: {
        name: { hi: "भजन संध्या", en: "Bhajan Sandhya" },
        description: { hi: "", en: "" },
        contentTypes: ["BHAJAN"],
        isActive: true,
        sortOrder: 1,
      },
    };
    for (const role of ["EDITOR", "ANALYST", "MODERATOR"] as const)
      await rejects(staff[role].call("saveCatalogItem", category), "permission-denied");
    for (const role of ["CONTENT_ADMIN", "EDITOR", "ANALYST"] as const)
      await rejects(staff[role].call("searchUsers", { filter: "all", pageSize: 10 }), "permission-denied");
    await rejects(
      staff.MODERATOR.call("setUserDisabled", { uid: devotee.uid, disabled: true, reason: "spam" }),
      "permission-denied",
    );
    for (const role of ["CONTENT_ADMIN", "ANALYST"] as const)
      await rejects(
        staff[role].call("saveConfig", { id: "puja", data: {}, expectedVersion: 0 }),
        "permission-denied",
      );
    await rejects(staff.ANALYST.call("deleteAsset", { assetId: "banner-00000000" }), "permission-denied");
    await rejects(staff.CONTENT_ADMIN.call("listAdmins", {}), "permission-denied");
  });
});

describe("dashboard", () => {
  test("counts devotees, practice and content, and caches the result", async () => {
    const value = await staff.ANALYST.call<{
      users: { total: number; guests: number; signedIn: number; new7: number; active1: number };
      practice: { series: { day: string; practised: number; qualifying: number }[] };
      alerts: { key: string }[];
    }>("getDashboard", { force: true });
    assert.deepEqual(
      [value.users.total, value.users.guests, value.users.signedIn, value.users.new7, value.users.active1],
      [2, 1, 1, 1, 1],
    );
    assert.equal(value.practice.series.length, 14);
    // No challenges are queued in this project, so the calendar alert is on.
    assert.ok(value.alerts.some((alert) => alert.key === "challengesShort"));
    await db.doc(`users/${guest.uid}-2`).set({ isAnonymous: true, createdAt: hoursAgo(1) });
    const cached = await staff.ANALYST.call<{ users: { total: number } }>("getDashboard", {});
    assert.equal(cached.users.total, 2);
    const fresh = await staff.ANALYST.call<{ users: { total: number } }>("getDashboard", { force: true });
    assert.equal(fresh.users.total, 3);
    await db.doc(`users/${guest.uid}-2`).delete();
  });
});

describe("catalogue", () => {
  test("content admins create, update and delete with audit; deities need art", async () => {
    const festival = {
      name: { hi: "दीपावली", en: "Diwali" },
      description: { hi: "", en: "" },
      date: "2026-11-08",
      deityIds: ["lakshmi", "ganesha"],
      isFeatured: true,
      isPublished: true,
    };
    const { id } = await staff.CONTENT_ADMIN.call<{ id: string }>("saveCatalogItem", {
      kind: "festival",
      create: true,
      data: festival,
    });
    assert.match(id, /^diwali-[0-9a-f]{6}$/);
    await staff.CONTENT_ADMIN.call("saveCatalogItem", {
      kind: "festival",
      id,
      create: false,
      data: { ...festival, endDate: "2026-11-09" },
    });
    const stored = (await db.doc(`festivals/${id}`).get()).data()!;
    assert.equal(stored.endDate, "2026-11-09");
    assert.equal(stored.updatedBy, staff.CONTENT_ADMIN.uid);
    await rejects(
      staff.CONTENT_ADMIN.call("saveCatalogItem", { kind: "festival", id, create: true, data: festival }),
      "already-exists",
    );
    await rejects(
      staff.CONTENT_ADMIN.call("saveCatalogItem", {
        kind: "festival",
        create: true,
        data: { ...festival, endDate: "2026-11-01" },
      }),
      "invalid-argument",
    );
    await staff.CONTENT_ADMIN.call("deleteCatalogItem", { kind: "festival", id });
    assert.equal((await db.doc(`festivals/${id}`).get()).exists, false);
    assert.deepEqual(await auditActions(id), ["festival.create", "festival.update", "festival.delete"]);

    const deity = {
      name: { hi: "शिव", en: "Shiva" },
      description: { hi: "", en: "" },
      aliases: ["mahadev"],
      isActive: true,
      isMandirEnabled: true,
      sortOrder: 1,
    };
    await rejects(
      staff.SUPER_ADMIN.call("saveCatalogItem", { kind: "deity", id: "shiva", create: true, data: deity }),
      "failed-precondition",
      "ART_REQUIRED",
    );
    await staff.SUPER_ADMIN.call("saveCatalogItem", {
      kind: "deity",
      id: "shiva",
      create: true,
      data: { ...deity, mandirArt: { mobile: { key: "deity/shiva/mobile.0123abcd.webp" } } },
    });
    await rejects(
      staff.SUPER_ADMIN.call("deleteCatalogItem", { kind: "deity", id: "shiva" }),
      "failed-precondition",
      "DEACTIVATE_INSTEAD",
    );
  });

  test("challenge dates are stored as timestamps", async () => {
    const { id } = await staff.CONTENT_ADMIN.call<{ id: string }>("saveCatalogItem", {
      kind: "challenge",
      create: true,
      data: {
        title: { hi: "सात दिन का जाप", en: "Seven days of jaap" },
        description: { hi: "हर दिन एक माला", en: "One mala a day" },
        period: "WEEKLY",
        metric: "JAAP_MALAS",
        targetValue: 7,
        xpReward: 50,
        audience: "ALL",
        isActive: true,
        startAt: "2026-10-05T00:00:00.000Z",
        endAt: "2026-10-12T00:00:00.000Z",
      },
    });
    const stored = (await db.doc(`challenges/${id}`).get()).data()!;
    assert.ok(stored.startAt instanceof Timestamp);
    assert.equal(stored.endAt.toDate().toISOString(), "2026-10-12T00:00:00.000Z");
  });
});

describe("versioned config", () => {
  const puja = () => ({
    general: offeringsFor(null),
    deities: { shiva: offeringsFor("shiva"), hanuman: offeringsFor("hanuman") },
  });

  test("saves versions, refuses stale editors and restores old versions", async () => {
    const first = await staff.SUPER_ADMIN.call<{ version: number }>("saveConfig", {
      id: "puja",
      data: puja(),
      expectedVersion: 0,
    });
    assert.equal(first.version, 1);
    const changed = puja();
    changed.deities.hanuman = { ...changed.deities.hanuman, bhog: ["laddoo"] };
    await staff.SUPER_ADMIN.call("saveConfig", { id: "puja", data: changed, expectedVersion: 1 });
    await rejects(
      staff.SUPER_ADMIN.call("saveConfig", { id: "puja", data: changed, expectedVersion: 1 }),
      "failed-precondition",
      "STALE",
    );
    const restored = await staff.SUPER_ADMIN.call<{ version: number }>("rollbackConfig", {
      id: "puja",
      toVersion: 1,
      expectedVersion: 2,
    });
    assert.equal(restored.version, 3);
    const live = (await db.doc("appConfig/puja").get()).data()!;
    assert.equal(live.version, 3);
    assert.deepEqual(live.deities.hanuman.bhog, offeringsFor("hanuman").bhog);
    const versions = await db.collection("appConfig/puja/versions").get();
    assert.deepEqual(
      versions.docs.map((doc) => doc.get("action")).sort(),
      ["rollback-1", "save", "save"],
    );
    assert.deepEqual(await auditActions("puja"), ["config.save", "config.save", "config.rollback-1"]);
  });

  test("refuses forbidden offerings and a daily cap below an award", async () => {
    const bad = puja();
    bad.deities.shiva = { ...bad.deities.shiva, flowers: ["bilva", "tulsi"] };
    await rejects(
      staff.SUPER_ADMIN.call("saveConfig", { id: "puja", data: bad, expectedVersion: 3 }),
      "invalid-argument",
      "FORBIDDEN_OFFERING",
    );
    const { version: _version, ...gamification } = defaultGamificationConfig;
    void _version;
    await rejects(
      staff.SUPER_ADMIN.call("saveConfig", {
        id: "gamification",
        data: { ...gamification, limits: { ...gamification.limits, dailyXpCap: 1 } },
        expectedVersion: 0,
      }),
      "invalid-argument",
      "CAP_TOO_LOW",
    );
  });
});

describe("users", () => {
  type Row = { uid: string; displayName: string | null; flagged: boolean; disabled: boolean };
  const search = (input: object) =>
    staff.MODERATOR.call<{ items: Row[] }>("searchUsers", { filter: "all", pageSize: 20, ...input });

  test("moderators find devotees by email, ID, name prefix and filter", async () => {
    assert.deepEqual((await search({ query: devotee.email })).items.map((row) => row.uid), [devotee.uid]);
    assert.deepEqual((await search({ query: devotee.uid })).items.map((row) => row.uid), [devotee.uid]);
    assert.deepEqual((await search({ query: "Rad" })).items.map((row) => row.uid), [devotee.uid]);
    assert.deepEqual((await search({ query: "Zed" })).items, []);
    assert.deepEqual((await search({ filter: "guests" })).items.map((row) => row.uid), [guest.uid]);
    assert.deepEqual((await search({})).items.map((row) => row.uid), [devotee.uid, guest.uid]);
    // The callable client sends missing fields as null; that is accepted.
    await search({ query: null, after: null });
  });

  test("detail shows the account and practice but never credentials", async () => {
    const detail = await staff.MODERATOR.call<Record<string, unknown>>("getUserDetail", { uid: devotee.uid });
    const text = JSON.stringify(detail);
    assert.match(text, /radha@devotee.test/);
    assert.match(text, /Radha Devi/);
    assert.doesNotMatch(text, /passwordHash|password-123|refreshToken|tokensValidAfter/);
    await rejects(staff.MODERATOR.call("getUserDetail", { uid: "nobody-123" }), "not-found");
  });

  test("moderation flags, notes and resets the display name, with audit", async () => {
    await staff.MODERATOR.call("moderateUser", { uid: devotee.uid, action: "flag", reason: "XP spike" });
    assert.deepEqual((await search({ filter: "flagged" })).items.map((row) => row.uid), [devotee.uid]);
    await staff.MODERATOR.call("moderateUser", { uid: devotee.uid, action: "note", note: "Checked: genuine" });
    await staff.MODERATOR.call("moderateUser", { uid: devotee.uid, action: "unflag" });
    await staff.MODERATOR.call("moderateUser", { uid: devotee.uid, action: "resetDisplayName" });
    assert.equal((await db.doc(`users/${devotee.uid}`).get()).get("displayName"), null);
    assert.equal((await db.doc(`userAdmin/${devotee.uid}`).get()).get("notes").length, 1);
    assert.deepEqual((await search({ filter: "flagged" })).items, []);
    assert.deepEqual(await auditActions(devotee.uid), [
      "user.flag",
      "user.note",
      "user.unflag",
      "user.resetDisplayName",
    ]);
  });

  test("super admins disable and delete devotees, never staff or themselves", async () => {
    await rejects(
      staff.SUPER_ADMIN.call("setUserDisabled", { uid: staff.SUPER_ADMIN.uid, disabled: true, reason: "x" }),
      "failed-precondition",
    );
    await rejects(
      staff.SUPER_ADMIN.call("setUserDisabled", { uid: staff.EDITOR.uid, disabled: true, reason: "x" }),
      "failed-precondition",
      "ADMIN_ACCOUNT",
    );
    await staff.SUPER_ADMIN.call("setUserDisabled", { uid: devotee.uid, disabled: true, reason: "Abuse" });
    assert.equal((await adminAuth.getUser(devotee.uid)).disabled, true);
    assert.deepEqual((await search({ filter: "disabled" })).items.map((row) => row.uid), [devotee.uid]);

    await rejects(
      staff.SUPER_ADMIN.call("deleteUserAccount", { uid: devotee.uid, confirmUid: guest.uid, reason: "Asked" }),
      "invalid-argument",
    );
    await staff.SUPER_ADMIN.call("deleteUserAccount", { uid: devotee.uid, confirmUid: devotee.uid, reason: "Asked" });
    for (const path of [
      `users/${devotee.uid}`,
      `users/${devotee.uid}/days/2026-10-05`,
      `userStats/${devotee.uid}`,
      `userAdmin/${devotee.uid}`,
      `userChallenges/${devotee.uid}_weekly`,
    ])
      assert.equal((await db.doc(path).get()).exists, false, path);
    // The ledger line stays, without the user.
    assert.equal((await db.doc("rewardTransactions/ledger-1").get()).get("uid"), "deleted-user");
    await assert.rejects(adminAuth.getUser(devotee.uid));
    const actions = await auditActions(devotee.uid);
    assert.deepEqual(actions.slice(-2), ["user.disable", "user.delete"]);
  });
});

describe("staff and assets", () => {
  test("super admins list every staff account with its role", async () => {
    const { admins } = await staff.SUPER_ADMIN.call<{ admins: { email: string; role: string }[] }>("listAdmins", {});
    assert.deepEqual(
      admins.map((admin) => `${admin.email}:${admin.role}`).sort(),
      roles.map((role) => `${role.toLowerCase()}@admin.test:${role}`).sort(),
    );
  });

  test("asset uploads need R2 credentials; deleting a missing asset fails", async () => {
    const request = { purpose: "banner", label: "Diwali", contentType: "image/webp", bytes: 1024 };
    await rejects(
      staff.EDITOR.call("requestAssetUpload", { ...request, contentType: "image/gif" }),
      "invalid-argument",
    );
    // The emulator has no R2 credentials, so no URL is ever issued here.
    await rejects(staff.EDITOR.call("requestAssetUpload", request), "failed-precondition");
    await rejects(staff.EDITOR.call("deleteAsset", { assetId: "banner-00000000" }), "not-found");
  });
});
