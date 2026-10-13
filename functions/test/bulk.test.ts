// Integration tests for the bulkContent callable (admin library
// multi-select). Run inside `npm run test:functions` against the Auth,
// Firestore and Functions emulators for demo-bhaktara (never cloud data).
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
import type {
  BulkContentResult,
  BulkItemResult,
  ContentDraftInput,
} from "../../src/domain/cms";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "bulk-test-admin");
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clients: FirebaseApp[] = [];

type Caller = <T = unknown>(name: string, data?: unknown) => Promise<T>;
const roles = ["CONTENT_ADMIN", "EDITOR", "ANALYST"] as const;
const users = {} as Record<(typeof roles)[number], { uid: string; call: Caller }>;
let signedOut: Caller;

async function client(
  signIn?: (app: FirebaseApp) => Promise<{ user: { uid: string } }>,
) {
  const app = initializeApp(
    { projectId, apiKey: "demo-key" },
    `bulk-client-${clients.length}`,
  );
  clients.push(app);
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const credential = signIn ? await signIn(app) : null;
  const call: Caller = async (name, data) =>
    (await httpsCallable(functions, name, { timeout: 60_000 })(data))
      .data as never;
  return { uid: credential?.user.uid ?? "", call };
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FunctionsError, String(error));
    assert.equal(error.code, `functions/${code}`, error.message);
    return true;
  });
}

async function auditFor(entityId: string) {
  const snapshot = await db
    .collection("auditLogs")
    .where("entityId", "==", entityId)
    .get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

const media = (id: string) => ({
  thumb: { key: `wallpaper/${id}/thumb.0123abcd.webp` },
  mobile: { key: `wallpaper/${id}/mobile.0123abcd.webp` },
  full: { key: `wallpaper/${id}/full.0123abcd.png` },
});
const draft = (
  id: string,
  overrides: Partial<ContentDraftInput> = {},
): ContentDraftInput => ({
  type: "WALLPAPER",
  title: { hi: "हनुमान वॉलपेपर", en: "Hanuman Wallpaper" },
  description: { hi: "", en: "" },
  deityIds: ["hanuman"],
  categoryIds: [],
  tags: ["sankat mochan"],
  media: media(id),
  isFeatured: false,
  saveGate: "REWARDED",
  isShareable: true,
  adEligible: true,
  private: {},
  ...overrides,
});

const create = (id: string, overrides: Partial<ContentDraftInput> = {}) =>
  users.EDITOR.call("createContent", { id, draft: draft(id, overrides) });
const bulk = (caller: Caller, ids: string[], action: unknown) =>
  caller<BulkContentResult>("bulkContent", { ids, action });
const status = async (id: string) =>
  (await db.doc(`content/${id}`).get()).data()?.status;
const byId = (result: BulkContentResult) =>
  Object.fromEntries(result.results.map((item) => [item.id, item])) as Record<
    string,
    BulkItemResult
  >;

// Creates live items through the real workflow (CONTENT_ADMIN publishes).
async function published(...ids: string[]) {
  for (const id of ids) await create(id);
  const result = await bulk(users.CONTENT_ADMIN.call, ids, {
    kind: "transition",
    to: "PUBLISHED",
  });
  assert.ok(result.results.every((item) => item.ok), JSON.stringify(result));
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
  ])
    assert.ok((await fetch(url, { method: "DELETE" })).ok);
  await db.doc("deities/hanuman").set({
    name: { en: "Hanuman", hi: "हनुमान" },
    aliases: ["bajrang"],
    isActive: true,
  });
  await db.doc("deities/shiva").set({
    name: { en: "Shiva", hi: "शिव" },
    aliases: ["mahadev"],
    isActive: true,
  });
  for (const role of roles) {
    const email = `${role.toLowerCase()}@bulk.test`;
    const user = await adminAuth.createUser({ email, password: "password-123" });
    await adminAuth.setCustomUserClaims(user.uid, { role });
    users[role] = await client((app) =>
      signInWithEmailAndPassword(getAuth(app), email, "password-123"),
    );
  }
  signedOut = (await client()).call;
  // Warm up the callables (cold starts can time out on a busy machine).
  for (const name of ["createContent", "bulkContent"])
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

describe("bulkContent input", () => {
  test("rejects 201 IDs, duplicates and callers without a content role", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `many-${index}`);
    await rejects(
      bulk(users.CONTENT_ADMIN.call, ids, { kind: "delete" }),
      "invalid-argument",
    );
    await rejects(
      bulk(users.CONTENT_ADMIN.call, ["a", "a"], { kind: "delete" }),
      "invalid-argument",
    );
    await rejects(
      bulk(users.ANALYST.call, ["a"], { kind: "transition", to: "READY" }),
      "permission-denied",
    );
    await rejects(
      bulk(signedOut, ["a"], { kind: "transition", to: "READY" }),
      "unauthenticated",
    );
  });

  test("scheduling requires scheduledAt", async () => {
    await rejects(
      bulk(users.CONTENT_ADMIN.call, ["a"], {
        kind: "transition",
        to: "SCHEDULED",
      }),
      "invalid-argument",
    );
    await create("bulk-sched");
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const result = await bulk(users.CONTENT_ADMIN.call, ["bulk-sched"], {
      kind: "transition",
      to: "READY",
    });
    assert.equal(result.results[0].ok, true);
    const scheduled = await bulk(users.CONTENT_ADMIN.call, ["bulk-sched"], {
      kind: "transition",
      to: "SCHEDULED",
      scheduledAt: at,
    });
    assert.deepEqual(scheduled.results, [
      { id: "bulk-sched", ok: true, status: "SCHEDULED" },
    ]);
    const content = (await db.doc("content/bulk-sched").get()).data()!;
    assert.equal(content.scheduledAt.toDate().toISOString(), at);
  });
});

describe("bulk transitions", () => {
  test("ready items move, not-ready and missing items fail on their own", async () => {
    await create("bulk-ready-1");
    await create("bulk-ready-2");
    await create("bulk-not-ready", {
      media: { thumb: media("bulk-not-ready").thumb },
    });
    const result = byId(
      await bulk(
        users.EDITOR.call,
        ["bulk-ready-1", "bulk-not-ready", "bulk-missing", "bulk-ready-2"],
        { kind: "transition", to: "READY" },
      ),
    );
    assert.deepEqual(result["bulk-ready-1"], {
      id: "bulk-ready-1",
      ok: true,
      status: "READY",
    });
    assert.equal(result["bulk-ready-2"].ok, true);
    assert.equal(result["bulk-not-ready"].ok, false);
    assert.equal(result["bulk-not-ready"].status, "DRAFT");
    assert.deepEqual(
      result["bulk-not-ready"].problems?.map((problem) => problem.field),
      ["media.mobile", "media.full"],
    );
    assert.equal(result["bulk-missing"].ok, false);
    assert.match(result["bulk-missing"].error!, /not found/);
    assert.equal(await status("bulk-ready-1"), "READY");
    assert.equal(await status("bulk-not-ready"), "DRAFT");
    const audit = (await auditFor("bulk-ready-1")).at(-1)!;
    assert.equal(audit.action, "content.bulk.transition");
    assert.deepEqual(audit.beforeSummary, { status: "DRAFT" });
    assert.deepEqual(audit.afterSummary, { status: "READY" });
    assert.equal(
      (await auditFor("bulk-not-ready")).filter(
        (entry) => entry.action === "content.bulk.transition",
      ).length,
      0,
    );
  });

  test("publish now takes a ready DRAFT straight to PUBLISHED", async () => {
    await create("bulk-now");
    await create("bulk-now-incomplete", {
      deityIds: [],
    });
    const result = byId(
      await bulk(
        users.CONTENT_ADMIN.call,
        ["bulk-now", "bulk-now-incomplete"],
        { kind: "transition", to: "PUBLISHED" },
      ),
    );
    assert.deepEqual(result["bulk-now"], {
      id: "bulk-now",
      ok: true,
      status: "PUBLISHED",
    });
    const content = (await db.doc("content/bulk-now").get()).data()!;
    assert.equal(content.status, "PUBLISHED");
    assert.ok(content.publishedAt instanceof Timestamp);
    const transitions = (await auditFor("bulk-now")).filter(
      (entry) => entry.action === "content.bulk.transition",
    );
    assert.equal(transitions.length, 1);
    assert.deepEqual(transitions[0].afterSummary, {
      status: "PUBLISHED",
      via: "READY",
    });
    assert.equal(result["bulk-now-incomplete"].ok, false);
    assert.deepEqual(
      result["bulk-now-incomplete"].problems?.map((problem) => problem.field),
      ["deityIds"],
    );
    assert.equal(await status("bulk-now-incomplete"), "DRAFT");
  });

  test("an EDITOR cannot publish", async () => {
    await create("bulk-editor-draft");
    await create("bulk-editor-ready");
    await bulk(users.EDITOR.call, ["bulk-editor-ready"], {
      kind: "transition",
      to: "READY",
    });
    const result = await bulk(
      users.EDITOR.call,
      ["bulk-editor-draft", "bulk-editor-ready"],
      { kind: "transition", to: "PUBLISHED" },
    );
    for (const item of result.results) {
      assert.equal(item.ok, false);
      assert.match(item.error!, /EDITOR/);
    }
    assert.equal(await status("bulk-editor-draft"), "DRAFT");
    assert.equal(await status("bulk-editor-ready"), "READY");
  });
});

describe("bulk metadata updates", () => {
  test("add, remove and replace deities on a PUBLISHED item update the live document", async () => {
    await published("bulk-live");
    const update = (patch: unknown, caller = users.CONTENT_ADMIN.call) =>
      bulk(caller, ["bulk-live"], { kind: "update", patch });
    const live = async () => (await db.doc("content/bulk-live").get()).data()!;

    // Editors may not change what users see without a publisher.
    const denied = await update(
      { deityIds: { mode: "add", values: ["shiva"] } },
      users.EDITOR.call,
    );
    assert.equal(denied.results[0].ok, false);
    assert.deepEqual((await live()).deityIds, ["hanuman"]);

    const added = await update({
      deityIds: { mode: "add", values: ["shiva"] },
      isFeatured: true,
    });
    assert.deepEqual(added.results, [
      { id: "bulk-live", ok: true, status: "PUBLISHED" },
    ]);
    let content = await live();
    assert.equal(content.status, "PUBLISHED");
    assert.deepEqual(content.deityIds, ["hanuman", "shiva"]);
    assert.equal(content.isFeatured, true);
    assert.ok(content.searchTokens.includes("mahadev"));
    const audit = (await auditFor("bulk-live")).at(-1)!;
    assert.equal(audit.action, "content.bulk.update");
    assert.deepEqual(audit.afterSummary.changedFields, [
      "deityIds",
      "isFeatured",
    ]);
    assert.deepEqual(audit.beforeSummary.deityIds, ["hanuman"]);

    await update({ deityIds: { mode: "remove", values: ["hanuman"] } });
    content = await live();
    assert.deepEqual(content.deityIds, ["shiva"]);
    assert.ok(!content.searchTokens.includes("bajrang"));

    await update({ deityIds: { mode: "replace", values: ["hanuman"] } });
    content = await live();
    assert.deepEqual(content.deityIds, ["hanuman"]);
    assert.ok(content.searchTokens.includes("bajrang"));
    assert.ok(!content.searchTokens.includes("mahadev"));

    // A live item must keep at least one deity.
    const emptied = await update({ deityIds: { mode: "replace", values: [] } });
    assert.equal(emptied.results[0].ok, false);
    assert.deepEqual(
      emptied.results[0].problems?.map((problem) => problem.field),
      ["deityIds"],
    );
    assert.deepEqual((await live()).deityIds, ["hanuman"]);
  });

  test("an unknown deity fails only the item that has it", async () => {
    await create("bulk-known");
    await create("bulk-stale");
    // An older item still points at a deity that no longer exists.
    await db.doc("content/bulk-stale").update({ deityIds: ["hanuman", "ghost"] });
    const result = byId(
      await bulk(users.EDITOR.call, ["bulk-known", "bulk-stale"], {
        kind: "update",
        patch: { deityIds: { mode: "add", values: ["shiva"] } },
      }),
    );
    assert.deepEqual(result["bulk-known"], {
      id: "bulk-known",
      ok: true,
      status: "DRAFT",
    });
    assert.equal(result["bulk-stale"].ok, false);
    assert.match(result["bulk-stale"].problems![0].message, /unknown deity ghost/);
    const known = (await db.doc("content/bulk-known").get()).data()!;
    assert.deepEqual(known.deityIds, ["hanuman", "shiva"]);
    const stale = (await db.doc("content/bulk-stale").get()).data()!;
    assert.deepEqual(stale.deityIds, ["hanuman", "ghost"]);

    // Adding an unknown deity is a per-item failure, not a call failure.
    const zeus = await bulk(users.EDITOR.call, ["bulk-known"], {
      kind: "update",
      patch: { deityIds: { mode: "add", values: ["zeus"] } },
    });
    assert.equal(zeus.results[0].ok, false);
    assert.match(zeus.results[0].problems![0].message, /unknown deity zeus/);
  });
});

describe("bulk delete", () => {
  test("refuses published items and deletes archived and never-published ones", async () => {
    await published("bulk-del-live", "bulk-del-archived");
    await bulk(users.CONTENT_ADMIN.call, ["bulk-del-archived"], {
      kind: "transition",
      to: "ARCHIVED",
    });
    await create("bulk-del-draft");
    await rejects(
      bulk(users.EDITOR.call, ["bulk-del-draft"], { kind: "delete" }),
      "permission-denied",
    );
    const result = byId(
      await bulk(
        users.CONTENT_ADMIN.call,
        ["bulk-del-live", "bulk-del-archived", "bulk-del-draft"],
        { kind: "delete" },
      ),
    );
    assert.equal(result["bulk-del-live"].ok, false);
    assert.equal(result["bulk-del-live"].status, "PUBLISHED");
    assert.match(result["bulk-del-live"].error!, /archived/);
    assert.equal(await status("bulk-del-live"), "PUBLISHED");

    for (const id of ["bulk-del-archived", "bulk-del-draft"]) {
      assert.deepEqual(result[id], { id, ok: true });
      assert.equal((await db.doc(`content/${id}`).get()).exists, false);
      assert.equal((await db.doc(`contentPrivate/${id}`).get()).exists, false);
      const audit = (await auditFor(id)).at(-1)!;
      assert.equal(audit.action, "content.bulk.delete");
      assert.equal(audit.afterSummary, null);
    }
  });
});
