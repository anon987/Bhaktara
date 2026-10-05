// Integration tests for the Home feed builder, its triggers and the Home
// manager callables. They run inside `npm run test:functions` (Auth,
// Firestore and Functions emulators, isolated demo-bhaktara project).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
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
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import type { HomeLayoutSectionInput } from "../../src/domain/home";
import { seedEmulator } from "../../scripts/emulator/seed";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "home-test-admin");
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clients: FirebaseApp[] = [];
const callables = [
  "getHomeLayout",
  "updateHomeLayout",
  "previewHomeFeed",
  "rebuildHomeFeed",
];

type Caller = <T = unknown>(name: string, data?: unknown) => Promise<T>;
const roles = ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR", "ANALYST"] as const;
const users = {} as Record<
  (typeof roles)[number] | "NONE",
  { uid: string; call: Caller }
>;
let anonymous: Caller;
let signedOut: Caller;

async function client(
  signIn?: (app: FirebaseApp) => Promise<{ user: { uid: string } }>,
) {
  const app = initializeApp(
    { projectId, apiKey: "demo-key" },
    `home-client-${clients.length}`,
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

async function rejects(
  promise: Promise<unknown>,
  code: string,
  check?: (details: never) => void,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FunctionsError, String(error));
    assert.equal(error.code, `functions/${code}`, error.message);
    check?.(error.details as never);
    return true;
  });
}

async function auditFor(entity: string) {
  const snapshot = await db
    .collection("auditLogs")
    .where("entity", "==", entity)
    .get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

const feed = async (language: "hi" | "en") =>
  (await db.doc(`homeFeeds/${language}`).get()).data()!;
const state = async () => (await db.doc("jobState/buildHomeFeed").get()).data();
const ids = (items: { id: string }[]) => items.map((item) => item.id);
const section = (value: Record<string, unknown>, id: string) =>
  (value.sections as Record<string, unknown>[]).find(
    (entry) => entry.id === id,
  ) as { items: { id: string }[] } & Record<string, unknown>;

// In-process builder (the same module the emulator runs), as cms.test.ts
// does for the scheduled publisher.
const builder = () => import("../src/home");

// Settles background trigger work: rebuild until no trigger marks the flag
// again for a while.
async function settle() {
  const { rebuildHomeFeeds } = await builder();
  for (let attempt = 0; attempt < 8; attempt++) {
    await rebuildHomeFeeds({ reason: "TEST_SETTLE" });
    await sleep(1_500);
    if ((await state())?.dirty !== true) return;
  }
  assert.fail("Home feed triggers did not settle");
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await read();
    if (done(value)) return value;
    await sleep(500);
  }
  assert.fail("Timed out waiting for the emulator");
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
  ])
    assert.ok((await fetch(url, { method: "DELETE" })).ok);
  await seedEmulator();
  for (const role of [...roles, "NONE" as const]) {
    const email = `${role.toLowerCase()}@home.test`;
    const user = await adminAuth.createUser({
      email,
      password: "password-123",
    });
    if (role !== "NONE")
      await adminAuth.setCustomUserClaims(user.uid, { role });
    users[role] = await client((app) =>
      signInWithEmailAndPassword(getAuth(app), email, "password-123"),
    );
  }
  anonymous = (await client((app) => signInAnonymously(getAuth(app)))).call;
  signedOut = (await client()).call;
  for (const name of callables)
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
  // Leave the canonical seeded catalog for later test files.
  await seedEmulator();
});

describe("buildHomeFeed", () => {
  test("rebuilding the seeded sources reproduces the seeded feeds", async () => {
    const seeded = { hi: await feed("hi"), en: await feed("en") };
    const { rebuildHomeFeeds } = await builder();
    const result = await rebuildHomeFeeds({ reason: "TEST" });
    assert.equal(result.status, "BUILT");
    assert.equal(result.languages.en.status, "UNCHANGED");
    assert.equal(result.languages.hi.status, "UNCHANGED");
    assert.equal(result.languages.en.banners, 2);
    // Bounded reads: 1 pool query (6 docs) + banners + collection items.
    assert.ok(result.reads <= 20, `read ${result.reads} documents`);
    for (const language of ["hi", "en"] as const)
      assert.equal(
        (await feed(language)).generatedAt.toMillis(),
        seeded[language].generatedAt.toMillis(),
        "an unchanged feed is not rewritten",
      );
    const builder_ = await state();
    assert.equal(builder_?.dirty, false);
    assert.equal(builder_?.builtClaimId, builder_?.claimId);
  });
});

describe("Home manager callables", () => {
  test("only content admins and super admins may use them", async () => {
    const inputs: Record<string, unknown> = {
      getHomeLayout: { language: "en" },
      updateHomeLayout: { language: "en", sections: [], expectedRevision: 1 },
      previewHomeFeed: { language: "en", sections: [] },
      rebuildHomeFeed: {},
    };
    for (const name of callables) {
      await rejects(signedOut(name, inputs[name]), "unauthenticated");
      await rejects(anonymous(name, inputs[name]), "permission-denied");
      for (const role of ["NONE", "EDITOR", "ANALYST"] as const)
        await rejects(
          users[role].call(name, inputs[name]),
          "permission-denied",
        );
    }
    const layout = (await db.doc("homeLayout/en").get()).data()!;
    assert.equal(layout.revision, 1);
    assert.deepEqual(await auditFor("homeLayout"), []);
    assert.deepEqual(await auditFor("homeFeed"), []);
  });

  test("layout updates validate, audit and rebuild the feed in order", async () => {
    // Newest item, but the least popular: only a NEW rail shows it.
    await db.doc("content/fresh-bhajan").set({
      status: "PUBLISHED",
      type: "BHAJAN",
      title: { en: "Fresh bhajan", hi: "नया भजन" },
      description: { en: "New", hi: "नया" },
      deityIds: ["krishna"],
      searchTokens: ["fresh"],
      media: {
        thumb: { key: "bhajan/fresh/thumb.webp", bytes: 10 },
        stream: { key: "bhajan/fresh/stream.m4a" },
      },
      durationSeconds: 120,
      saveGate: "FREE",
      isShareable: true,
      popularityScore: 0,
      publishedAt: Timestamp.now(),
    });
    const call = users.CONTENT_ADMIN.call;
    type Layout = { revision: number; sections: HomeLayoutSectionInput[] };
    const loaded = await call<Layout & { valid: boolean }>("getHomeLayout", {
      language: "en",
    });
    assert.equal(loaded.revision, 1);
    assert.equal(loaded.valid, true);
    assert.deepEqual(ids(loaded.sections), [
      "progress",
      "shortcuts",
      "sadhana",
      "trending",
      "aarti-sangrah",
      "bhajans",
      "quote",
    ]);

    const edit = (id: string, change: Record<string, unknown>) =>
      ({
        ...loaded.sections.find((entry) => entry.id === id)!,
        ...change,
      }) as HomeLayoutSectionInput;
    const shortcuts = loaded.sections.find(
      (entry) => entry.id === "shortcuts",
    ) as { items: unknown[] };
    const sections: HomeLayoutSectionInput[] = [
      edit("quote", { order: 0 }),
      edit("progress", { visible: false }),
      edit("shortcuts", { items: shortcuts.items.slice(0, 4) }),
      edit("trending", { title: { en: "Popular now", hi: "लोकप्रिय" } }),
      edit("bhajans", {
        visible: true,
        order: 15,
        limit: 3,
        source: { contentType: "BHAJAN", sort: "NEW" },
      }),
      edit("sadhana", {}),
      edit("aarti-sangrah", { limit: 2 }),
      { id: "banners", type: "BANNERS", order: 0, visible: true },
    ];

    for (const bad of [
      [...sections, sections[0]],
      [{ id: "x", type: "RAIL", order: 1, visible: true }],
      [
        {
          id: "s",
          type: "SHORTCUTS",
          order: 1,
          visible: true,
          items: [
            {
              label: { en: "Web", hi: "वेब" },
              iconKey: "web",
              target: { route: "web", url: "https://example.com" },
            },
          ],
        },
      ],
    ])
      await rejects(
        call("updateHomeLayout", {
          language: "en",
          sections: bad,
          expectedRevision: 1,
        }),
        "invalid-argument",
      );
    await rejects(
      call("updateHomeLayout", {
        language: "en",
        sections,
        expectedRevision: 0,
      }),
      "failed-precondition",
      (details: { reason: string; revision: number }) =>
        assert.deepEqual(details, {
          reason: "REVISION_MISMATCH",
          revision: 1,
        }),
    );

    const saved = await call<{
      revision: number;
      changed: boolean;
      rebuild: {
        status: string;
        languages: Record<string, { status: string }>;
      };
    }>("updateHomeLayout", { language: "en", sections, expectedRevision: 1 });
    assert.equal(saved.revision, 2);
    assert.equal(saved.changed, true);
    assert.equal(saved.rebuild.status, "BUILT");
    assert.equal(saved.rebuild.languages.en.status, "WRITTEN");

    const en = await feed("en");
    assert.deepEqual(ids(en.sections), [
      "quote",
      "bhajans",
      "shortcuts",
      "sadhana",
      "trending",
      "aarti-sangrah",
    ]);
    assert.deepEqual(ids(section(en, "bhajans").items), [
      "fresh-bhajan",
      "bhajan-1",
      "bhajan-2",
    ]);
    assert.deepEqual(ids(section(en, "trending").items), [
      "bhajan-1",
      "aarti-1",
      "mantra-1",
      "chalisa-1",
      "wallpaper-1",
      "ringtone-1",
    ]);
    assert.deepEqual(section(en, "trending").title, {
      en: "Popular now",
      hi: "लोकप्रिय",
    });
    assert.deepEqual(ids(section(en, "aarti-sangrah").items), [
      "aarti-1",
      "aarti-krishna",
    ]);
    assert.equal((section(en, "shortcuts").items as unknown[]).length, 4);
    assert.equal("limit" in section(en, "bhajans"), false);
    // Card-level fields only, even when the content doc has more.
    assert.deepEqual(section(en, "bhajans").items[0], {
      id: "fresh-bhajan",
      type: "BHAJAN",
      title: { en: "Fresh bhajan", hi: "नया भजन" },
      media: { thumb: { key: "bhajan/fresh/thumb.webp", bytes: 10 } },
      durationSeconds: 120,
    });
    // The other language keeps its own layout.
    assert.deepEqual(ids((await feed("hi")).sections), [
      "sadhana",
      "shortcuts",
      "aarti-sangrah",
      "trending",
      "progress",
      "quote",
    ]);

    const [audit] = await auditFor("homeLayout");
    assert.equal(audit.action, "home.layout.update");
    assert.equal(audit.adminUid, users.CONTENT_ADMIN.uid);
    assert.equal(audit.entityId, "en");
    assert.equal(audit.beforeSummary.revision, 1);
    assert.ok(audit.beforeSummary.sections.includes("bhajans (hidden)"));
    assert.equal(audit.afterSummary.revision, 2);
    assert.deepEqual(audit.afterSummary.sections.slice(0, 2), [
      "quote",
      "progress (hidden)",
    ]);
    assert.deepEqual([...audit.afterSummary.changedSections].sort(), [
      "aarti-sangrah",
      "banners",
      "bhajans",
      "progress",
      "quote",
      "shortcuts",
      "trending",
    ]);
    const stored = (await db.doc("homeLayout/en").get()).data()!;
    assert.equal(stored.updatedBy, users.CONTENT_ADMIN.uid);

    // Saving the same layout again changes nothing and audits nothing.
    const again = await call<{ changed: boolean; rebuild: unknown }>(
      "updateHomeLayout",
      { language: "en", sections, expectedRevision: 2 },
    );
    assert.equal(again.changed, false);
    assert.equal(again.rebuild, null);
    assert.equal((await auditFor("homeLayout")).length, 1);
  });

  test("preview builds an unsaved layout without writing", async () => {
    const before = await feed("hi");
    const preview = await users.SUPER_ADMIN.call<{
      sections: { id: string; items?: { id: string }[] }[];
      banners: { id: string; startAt: string }[];
    }>("previewHomeFeed", {
      language: "hi",
      sections: [
        {
          id: "newest",
          type: "RAIL",
          title: { en: "Newest", hi: "नवीनतम" },
          source: { sort: "NEW" },
          limit: 2,
          order: 1,
          visible: true,
        },
        {
          id: "quote",
          type: "QUOTE",
          text: { en: "a", hi: "b" },
          order: 0,
          visible: true,
        },
      ],
    });
    assert.deepEqual(ids(preview.sections), ["quote", "newest"]);
    assert.deepEqual(ids(preview.sections[1].items!), [
      "fresh-bhajan",
      "bhajan-1",
    ]);
    assert.deepEqual(ids(preview.banners), ["morning", "mandir"]);
    assert.match(preview.banners[0].startAt, /^\d{4}-\d\d-\d\dT/);
    const afterPreview = await feed("hi");
    assert.equal(
      afterPreview.generatedAt.toMillis(),
      before.generatedAt.toMillis(),
    );
    assert.equal((await db.doc("homeLayout/hi").get()).data()!.revision, 1);
  });

  test("banners: expired, inactive and other-language ones are dropped", async () => {
    const now = Date.now();
    const banner = (overrides: Record<string, unknown>) => ({
      title: { en: "Banner", hi: "बैनर" },
      subtitle: { en: "", hi: "" },
      ctaText: { en: "Open", hi: "खोलें" },
      image: { mobile: { key: "banner/x/mobile.webp" } },
      target: { route: "mandir" },
      priority: 50,
      startAt: Timestamp.fromMillis(now - 3_600_000),
      endAt: Timestamp.fromMillis(now + 3_600_000),
      isActive: true,
      languages: ["hi", "en"],
      ...overrides,
    });
    await db
      .doc("banners/expired")
      .set(banner({ endAt: Timestamp.fromMillis(now - 60_000) }));
    await db.doc("banners/inactive").set(banner({ isActive: false }));
    await db.doc("banners/hindi-only").set(banner({ languages: ["hi"] }));
    await db.doc("banners/soon-over").set(banner({ priority: 40 }));

    const result = await users.SUPER_ADMIN.call<{
      status: string;
      nextChangeAt: string;
    }>("rebuildHomeFeed", {});
    assert.equal(result.status, "BUILT");
    assert.equal(Date.parse(result.nextChangeAt), now + 3_600_000);
    assert.deepEqual(ids((await feed("en")).banners), [
      "soon-over",
      "morning",
      "mandir",
    ]);
    assert.deepEqual(ids((await feed("hi")).banners), [
      "hindi-only",
      "soon-over",
      "morning",
      "mandir",
    ]);
    const [audit] = await auditFor("homeFeed");
    assert.equal(audit.action, "home.feed.rebuild");
    assert.equal(audit.adminUid, users.SUPER_ADMIN.uid);
    assert.deepEqual(audit.afterSummary, {
      superseded: false,
      hi: "WRITTEN",
      en: "WRITTEN",
    });

    // When the window closes the scheduled run rebuilds without a write
    // having marked anything dirty.
    await settle();
    const { runScheduledHomeFeedBuild } = await builder();
    assert.deepEqual(await runScheduledHomeFeedBuild(new Date(now + 60_000)), {
      status: "IDLE",
    });
    const later = await runScheduledHomeFeedBuild(
      new Date(now + 2 * 3_600_000),
    );
    assert.equal(later.status, "BUILT");
    assert.equal("reason" in later && later.reason, "BANNER_WINDOW");
    assert.deepEqual(ids((await feed("en")).banners), ["morning", "mandir"]);
    for (const id of ["expired", "inactive", "hindi-only", "soon-over"])
      await db.doc(`banners/${id}`).delete();
  });
});

describe("rebuild trigger", () => {
  test("relevant writes mark the feed dirty; the scheduled run rebuilds", async () => {
    await settle();
    const { runScheduledHomeFeedBuild } = await builder();
    assert.deepEqual(await runScheduledHomeFeedBuild(), { status: "IDLE" });

    // A draft never reaches Home, so it does not mark anything.
    await db.doc("content/quiet-draft").set({
      status: "DRAFT",
      type: "BHAJAN",
      title: { en: "Draft", hi: "मसौदा" },
    });
    await sleep(3_000);
    assert.equal((await state())?.dirty, false);

    await db.doc("content/hit-mantra").set({
      status: "PUBLISHED",
      type: "MANTRA",
      title: { en: "Hit mantra", hi: "लोकप्रिय मंत्र" },
      media: { thumb: { key: "mantra/hit/thumb.webp" } },
      popularityScore: 1_000,
      publishedAt: Timestamp.now(),
    });
    const marked = await waitFor(state, (value) => value?.dirty === true);
    assert.equal(marked?.dirtyReason, "content/hit-mantra");

    const result = await runScheduledHomeFeedBuild();
    assert.equal(result.status, "BUILT");
    assert.equal("reason" in result && result.reason, "DIRTY");
    assert.equal(
      ids(section(await feed("en"), "trending").items)[0],
      "hit-mantra",
    );
    assert.equal(
      ids(section(await feed("hi"), "trending").items)[0],
      "hit-mantra",
    );
    assert.deepEqual(await runScheduledHomeFeedBuild(), { status: "IDLE" });

    // Archiving removes it again through the same path.
    await db.doc("content/hit-mantra").update({ status: "ARCHIVED" });
    await waitFor(state, (value) => value?.dirty === true);
    await runScheduledHomeFeedBuild();
    assert.ok(
      !ids(section(await feed("en"), "trending").items).includes("hit-mantra"),
    );
  });
});
