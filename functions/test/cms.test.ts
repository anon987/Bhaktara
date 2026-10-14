// Integration tests for the Admin CMS callables. They run inside
// `npm run test:functions`, which starts the Auth, Firestore and Functions
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
  signInAnonymously,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { applicableChecks } from "../../src/domain/checklist";
import type { ContentDraftInput } from "../../src/domain/cms";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "cms-test-admin");
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
    `client-${clients.length}`,
  );
  clients.push(app);
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const credential = signIn ? await signIn(app) : null;
  const call: Caller = async (name, data) =>
    (await httpsCallable(functions, name, { timeout: 30_000 })(data))
      .data as never;
  return { uid: credential?.user.uid ?? "", call };
}

// Expect a callable to fail with a stable code (and optional details).
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

async function auditFor(entityId: string) {
  const snapshot = await db
    .collection("auditLogs")
    .where("entityId", "==", entityId)
    .get();
  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

const draft = (
  overrides: Partial<ContentDraftInput> = {},
): ContentDraftInput => ({
  type: "WALLPAPER",
  title: { hi: "हनुमान वॉलपेपर", en: "Hanuman Wallpaper" },
  description: { hi: "विवरण", en: "Description" },
  deityIds: ["hanuman"],
  categoryIds: [],
  tags: ["sankat mochan"],
  media: {
    thumb: { key: "wallpaper/cms-wall/thumb.0123abcd.webp" },
    mobile: { key: "wallpaper/cms-wall/mobile.0123abcd.webp" },
    full: { key: "wallpaper/cms-wall/full.0123abcd.png" },
  },
  isFeatured: false,
  saveGate: "REWARDED",
  isShareable: true,
  adEligible: true,
  // Provenance and the checklist are optional notes, never gates.
  private: {},
  ...overrides,
});
const allChecked = (type: ContentDraftInput["type"]) =>
  Object.fromEntries(applicableChecks(type).map((item) => [item, true]));

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  // Fresh emulator state for this isolated project only.
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
  for (const role of [...roles, "NONE" as const]) {
    const email = `${role.toLowerCase()}@cms.test`;
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
  // The emulator starts one worker per function on first use. On a busy
  // machine a cold start can time out, so warm each callable up first.
  for (const name of [
    "createContent",
    "updateContent",
    "transitionContentStatus",
    "createBanner",
    "updateBanner",
    "deleteBanner",
    "setAdminRole",
    "requestUploadUrl",
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

describe("roles", () => {
  test("callables reject missing, anonymous and role-less callers", async () => {
    const data = { id: "denied", draft: draft() };
    await rejects(signedOut("createContent", data), "unauthenticated");
    await rejects(anonymous("createContent", data), "permission-denied");
    await rejects(users.NONE.call("createContent", data), "permission-denied");
    await rejects(
      users.ANALYST.call("createContent", data),
      "permission-denied",
    );
    await rejects(
      users.MODERATOR.call("createContent", data),
      "permission-denied",
    );
    assert.equal((await db.doc("content/denied").get()).exists, false);
    assert.deepEqual(await auditFor("denied"), []);
  });

  test("editors cannot manage banners, publish or change roles", async () => {
    await rejects(
      users.EDITOR.call("createBanner", { banner: {} }),
      "permission-denied",
    );
    await rejects(
      users.EDITOR.call("setAdminRole", {
        email: "none@cms.test",
        role: "EDITOR",
      }),
      "permission-denied",
    );
    await rejects(
      users.CONTENT_ADMIN.call("setAdminRole", {
        email: "none@cms.test",
        role: "EDITOR",
      }),
      "permission-denied",
    );
  });
});

describe("content workflow", () => {
  const id = "cms-wall";

  test("create validates input, writes a DRAFT, private record, tokens and audit", async () => {
    await rejects(
      users.EDITOR.call("createContent", { id: "Bad Id", draft: draft() }),
      "invalid-argument",
    );
    await rejects(
      users.EDITOR.call("createContent", {
        id,
        draft: { ...draft(), status: "PUBLISHED" },
      }),
      "invalid-argument",
    );
    await rejects(
      users.EDITOR.call("createContent", {
        id,
        draft: { ...draft(), searchTokens: ["spam"] },
      }),
      "invalid-argument",
    );
    await rejects(
      users.EDITOR.call("createContent", {
        id,
        draft: draft({ deityIds: ["zeus"] }),
      }),
      "invalid-argument",
      (details: { issues: { message: string }[] }) =>
        assert.match(details.issues[0].message, /unknown deity zeus/),
    );
    await rejects(
      users.EDITOR.call("createContent", {
        id,
        draft: draft({
          media: { thumb: { key: "https://evil.example/x.png" } },
        }),
      }),
      "invalid-argument",
    );

    const result = await users.EDITOR.call<{
      status: string;
      problems: { field: string }[];
    }>("createContent", { id, draft: draft() });
    assert.equal(result.status, "DRAFT");
    assert.deepEqual(result.problems, []);

    const content = (await db.doc(`content/${id}`).get()).data()!;
    assert.equal(content.status, "DRAFT");
    assert.equal(content.slug, id);
    assert.equal(content.popularityScore, 0);
    // Server-side tokens: title, tags, deity name and alias with prefixes.
    for (const token of [
      "hanuman",
      "ha",
      "vallpaper",
      "sankat",
      "bajrang",
      "हनुमान",
    ])
      assert.ok(content.searchTokens.includes(token), `missing token ${token}`);
    const provenance = (await db.doc(`contentPrivate/${id}`).get()).data()!;
    assert.equal(provenance.createdBy, users.EDITOR.uid);
    assert.deepEqual(
      Object.keys(provenance.checklist).sort(),
      [...applicableChecks("WALLPAPER")].sort(),
    );

    await rejects(
      users.EDITOR.call("createContent", { id, draft: draft() }),
      "already-exists",
    );
    const [audit] = await auditFor(id);
    assert.equal(audit.action, "content.create");
    assert.equal(audit.adminUid, users.EDITOR.uid);
    assert.equal(audit.entity, "content");
    assert.equal(audit.beforeSummary, null);
    assert.equal(audit.afterSummary.status, "DRAFT");
    assert.ok(audit.createdAt instanceof Timestamp);
  });

  test("createContent generates a unique slug ID when none is given", async () => {
    type Created = { id: string; status: string };
    const wall = draft({ title: { hi: "शिव", en: "Shiv Wallpaper" } });
    const first = await users.EDITOR.call<Created>("createContent", {
      draft: wall,
    });
    const second = await users.EDITOR.call<Created>("createContent", {
      id: "",
      draft: wall,
    });
    for (const created of [first, second]) {
      assert.match(created.id, /^shiv-wallpaper-[a-z0-9]{4}$/);
      assert.equal(created.status, "DRAFT");
      const content = (await db.doc(`content/${created.id}`).get()).data()!;
      assert.equal(content.slug, created.id);
      assert.ok((await db.doc(`contentPrivate/${created.id}`).get()).exists);
      assert.equal((await auditFor(created.id))[0].action, "content.create");
    }
    assert.notEqual(first.id, second.id);
    // Hindi-only titles are romanized for the ID.
    const hindi = await users.EDITOR.call<Created>("createContent", {
      draft: draft({ title: { hi: "हनुमान चालीसा", en: "" } }),
    });
    assert.match(hindi.id, /^hanuman-chalisa-[a-z0-9]{4}$/);
  });

  test("READY is gated only by required fields, never by checklist or provenance", async () => {
    // A wallpaper needs titles, a deity and thumb/mobile/full; no description.
    await users.EDITOR.call("updateContent", {
      id,
      draft: draft({
        description: { hi: "", en: "" },
        media: { thumb: { key: "wallpaper/cms-wall/thumb.0123abcd.webp" } },
      }),
    });
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "READY",
      }),
      "failed-precondition",
      (details: { reason: string; problems: { field: string }[] }) => {
        assert.equal(details.reason, "CHECKLIST_INCOMPLETE");
        assert.deepEqual(
          details.problems.map((problem) => problem.field),
          ["media.mobile", "media.full"],
        );
      },
    );
    await users.EDITOR.call("updateContent", { id, draft: draft() });
    assert.equal((await db.doc(`content/${id}`).get()).data()!.status, "DRAFT");
  });

  test("sacred audio reaches READY without source text; descriptions are required", async () => {
    const mantra = (overrides: Partial<ContentDraftInput> = {}) =>
      draft({
        type: "MANTRA",
        saveGate: "FREE",
        media: { thumb: { key: "mantra/cms-mantra/thumb.0123abcd.webp" } },
        ...overrides,
      });
    await users.EDITOR.call("createContent", {
      id: "cms-mantra",
      draft: mantra({ description: { hi: "", en: "" } }),
    });
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: "cms-mantra",
        to: "READY",
      }),
      "failed-precondition",
      (details: { problems: { field: string }[] }) =>
        assert.deepEqual(
          details.problems.map((problem) => problem.field),
          ["description.hi", "description.en", "media.stream"],
        ),
    );
    await users.EDITOR.call("updateContent", {
      id: "cms-mantra",
      draft: mantra({
        media: {
          thumb: { key: "mantra/cms-mantra/thumb.0123abcd.webp" },
          stream: { key: "mantra/cms-mantra/stream.0123abcd.m4a" },
        },
      }),
    });
    assert.deepEqual(
      await users.EDITOR.call("transitionContentStatus", {
        contentId: "cms-mantra",
        to: "READY",
      }),
      { id: "cms-mantra", from: "DRAFT", to: "READY" },
    );
  });

  test("lyrics are optional and round-trip through save and publish", async () => {
    const contentId = "cms-lyrics";
    const lyrics = {
      hi: "[Intro — Female Lead]\nसखी री, आँगन सजा दो,\nआज हनुमत का गुण गाएँ।",
      en: "",
    };
    const bhajan = (overrides: Partial<ContentDraftInput> = {}) =>
      draft({
        type: "BHAJAN",
        saveGate: "FREE",
        media: {
          thumb: { key: "bhajan/cms-lyrics/thumb.0123abcd.webp" },
          stream: { key: "bhajan/cms-lyrics/stream.0123abcd.m4a" },
        },
        ...overrides,
      });
    const stored = async () =>
      (await db.doc(`content/${contentId}`).get()).data()!;
    // Drafts without lyrics stay as they were: no lyrics field is stored.
    await users.EDITOR.call("createContent", {
      id: contentId,
      draft: bhajan(),
    });
    assert.equal((await stored()).lyrics, undefined);

    await users.EDITOR.call("updateContent", {
      id: contentId,
      draft: bhajan({ lyrics }),
    });
    assert.deepEqual((await stored()).lyrics, lyrics);
    const changed = async () =>
      (await auditFor(contentId)).at(-1)!.afterSummary
        .changedFields as string[];
    assert.ok((await changed()).includes("lyrics"));

    await users.EDITOR.call("transitionContentStatus", {
      contentId,
      to: "READY",
    });
    await users.CONTENT_ADMIN.call("transitionContentStatus", {
      contentId,
      to: "PUBLISHED",
    });
    const live = await stored();
    assert.equal(live.status, "PUBLISHED");
    assert.deepEqual(live.lyrics, lyrics);

    // Back to DRAFT, add the Hinglish lyrics, and clear them again.
    await users.CONTENT_ADMIN.call("transitionContentStatus", {
      contentId,
      to: "DRAFT",
    });
    const both = { ...lyrics, en: "Sakhi ri, aangan saja do," };
    await users.EDITOR.call("updateContent", {
      id: contentId,
      draft: bhajan({ lyrics: both }),
    });
    assert.deepEqual((await stored()).lyrics, both);
    // An editor that does not send lyrics keeps the stored ones.
    await users.EDITOR.call("updateContent", {
      id: contentId,
      draft: bhajan({ tags: ["sakhi"] }),
    });
    assert.deepEqual((await stored()).lyrics, both);
    assert.ok((await changed()).includes("tags"));
    assert.ok(!(await changed()).includes("lyrics"));
    // Sending empty lyrics clears them.
    await users.EDITOR.call("updateContent", {
      id: contentId,
      draft: bhajan({ tags: ["sakhi"], lyrics: { hi: "", en: "" } }),
    });
    assert.equal((await stored()).lyrics, undefined);
  });

  test("updates record changed fields; READY items are locked; invalid moves fail", async () => {
    await users.EDITOR.call("updateContent", {
      id,
      draft: draft({
        tags: ["sankat mochan", "anjaneya"],
        private: {
          aiTool: "Tool",
          aiPlan: "Pro",
          checklist: allChecked("WALLPAPER"),
        },
      }),
    });
    const update = (await auditFor(id)).at(-1)!;
    assert.equal(update.action, "content.update");
    assert.deepEqual(update.afterSummary.changedFields, ["private", "tags"]);
    assert.ok(
      (await db.doc(`content/${id}`).get())
        .data()!
        .searchTokens.includes("anjaneya"),
    );

    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "PUBLISHED",
      }),
      "failed-precondition",
      (details: { reason: string }) =>
        assert.equal(details.reason, "INVALID_TRANSITION"),
    );
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "FLYING",
      }),
      "invalid-argument",
    );
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: "missing",
        to: "READY",
      }),
      "not-found",
    );
    assert.deepEqual(
      await users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "READY",
      }),
      { id, from: "DRAFT", to: "READY" },
    );
    await rejects(
      users.EDITOR.call("updateContent", { id, draft: draft() }),
      "failed-precondition",
    );
    // Doc 08 §3: editors move items to READY; publishing needs CONTENT_ADMIN.
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "PUBLISHED",
      }),
      "permission-denied",
    );
  });

  test("content admins schedule, publish, unpublish and archive with audit entries", async () => {
    const call = users.CONTENT_ADMIN.call;
    await rejects(
      call("transitionContentStatus", { contentId: id, to: "SCHEDULED" }),
      "failed-precondition",
      (details: { reason: string }) =>
        assert.equal(details.reason, "SCHEDULE_REQUIRED"),
    );
    await rejects(
      call("transitionContentStatus", {
        contentId: id,
        to: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      }),
      "failed-precondition",
    );
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
    await call("transitionContentStatus", {
      contentId: id,
      to: "SCHEDULED",
      scheduledAt,
    });
    let content = (await db.doc(`content/${id}`).get()).data()!;
    assert.equal(content.status, "SCHEDULED");
    assert.equal(content.scheduledAt.toDate().toISOString(), scheduledAt);

    await call("transitionContentStatus", { contentId: id, to: "PUBLISHED" });
    content = (await db.doc(`content/${id}`).get()).data()!;
    assert.equal(content.status, "PUBLISHED");
    assert.ok(content.publishedAt instanceof Timestamp);
    const firstPublishedAt = content.publishedAt.toMillis();

    // Unpublish for a fix (doc 09 §3), then republish keeps the first date.
    await rejects(
      users.EDITOR.call("transitionContentStatus", {
        contentId: id,
        to: "DRAFT",
      }),
      "permission-denied",
    );
    await call("transitionContentStatus", { contentId: id, to: "DRAFT" });
    await users.EDITOR.call("transitionContentStatus", {
      contentId: id,
      to: "READY",
    });
    await call("transitionContentStatus", { contentId: id, to: "PUBLISHED" });
    content = (await db.doc(`content/${id}`).get()).data()!;
    assert.equal(content.publishedAt.toMillis(), firstPublishedAt);
    await call("transitionContentStatus", { contentId: id, to: "ARCHIVED" });

    const transitions = (await auditFor(id))
      .filter((entry) => entry.action === "content.transition")
      .map(
        (entry) => `${entry.beforeSummary.status}>${entry.afterSummary.status}`,
      );
    assert.deepEqual(transitions, [
      "DRAFT>READY",
      "READY>SCHEDULED",
      "SCHEDULED>PUBLISHED",
      "PUBLISHED>DRAFT",
      "DRAFT>READY",
      "READY>PUBLISHED",
      "PUBLISHED>ARCHIVED",
    ]);
  });

  test("the scheduler publishes due items and archives expired ones", async () => {
    const { publishDueContent } = await import("../src/content");
    const ready = draft();
    const inOneHour = new Date(Date.now() + 3_600_000).toISOString();
    for (const contentId of ["cms-due", "cms-expiring"]) {
      await users.EDITOR.call("createContent", {
        id: contentId,
        draft:
          contentId === "cms-expiring"
            ? {
                ...ready,
                expireAt: new Date(Date.now() + 7_200_000).toISOString(),
              }
            : ready,
      });
      await users.EDITOR.call("transitionContentStatus", {
        contentId,
        to: "READY",
      });
    }
    await users.CONTENT_ADMIN.call("transitionContentStatus", {
      contentId: "cms-due",
      to: "SCHEDULED",
      scheduledAt: inOneHour,
    });
    await users.CONTENT_ADMIN.call("transitionContentStatus", {
      contentId: "cms-expiring",
      to: "PUBLISHED",
    });

    assert.deepEqual(await publishDueContent(new Date()), {
      published: [],
      archived: [],
      failed: [],
    });
    const later = await publishDueContent(new Date(Date.now() + 3 * 3_600_000));
    assert.deepEqual(later, {
      published: ["cms-due"],
      archived: ["cms-expiring"],
      failed: [],
    });
    assert.equal(
      (await db.doc("content/cms-due").get()).data()!.status,
      "PUBLISHED",
    );
    assert.equal(
      (await db.doc("content/cms-expiring").get()).data()!.status,
      "ARCHIVED",
    );
    const system = (await auditFor("cms-due")).at(-1)!;
    assert.equal(system.adminUid, "system:publishScheduledContent");
    assert.deepEqual(system.afterSummary, { status: "PUBLISHED" });
  });
});

describe("banners", () => {
  const banner = {
    title: { hi: "आज की आरती", en: "Today's aarti" },
    subtitle: { hi: "", en: "" },
    ctaText: { hi: "खोलें", en: "Open" },
    image: { mobile: { key: "banner/today/mobile.0123abcd.webp" } },
    target: { route: "mandir" },
    priority: 5,
    startAt: "2026-10-01T00:00:00.000Z",
    endAt: "2026-12-01T00:00:00.000Z",
    isActive: true,
    languages: ["hi", "en"],
  };

  test("content admins create, update and delete banners with audit entries", async () => {
    const call = users.CONTENT_ADMIN.call;
    for (const bad of [
      { ...banner, target: { route: "https://evil.example" } },
      { ...banner, target: { route: "mandir", url: "https://evil.example" } },
      { ...banner, endAt: banner.startAt },
      { ...banner, languages: [] },
      { ...banner, title: { hi: "", en: "Only English" } },
    ])
      await rejects(call("createBanner", { banner: bad }), "invalid-argument");

    const { id } = await call<{ id: string }>("createBanner", { banner });
    let stored = (await db.doc(`banners/${id}`).get()).data()!;
    assert.ok(stored.startAt instanceof Timestamp);
    assert.deepEqual(stored.target, { route: "mandir" });

    await call("updateBanner", {
      id,
      banner: { ...banner, isActive: false, priority: 1 },
    });
    stored = (await db.doc(`banners/${id}`).get()).data()!;
    assert.equal(stored.isActive, false);
    await call("deleteBanner", { id });
    assert.equal((await db.doc(`banners/${id}`).get()).exists, false);
    await rejects(call("deleteBanner", { id }), "not-found");

    const audit = await auditFor(id);
    assert.deepEqual(
      audit.map((entry) => entry.action),
      ["banner.create", "banner.update", "banner.delete"],
    );
    assert.equal(audit[1].beforeSummary.isActive, true);
    assert.equal(audit[1].afterSummary.isActive, false);
    assert.equal(audit[2].afterSummary, null);
  });
});

describe("admin roles and uploads", () => {
  test("super admins grant and revoke roles, never their own", async () => {
    const call = users.SUPER_ADMIN.call;
    await rejects(
      call("setAdminRole", { email: "super_admin@cms.test", role: null }),
      "failed-precondition",
    );
    await rejects(
      call("setAdminRole", { email: "ghost@cms.test", role: "EDITOR" }),
      "not-found",
    );
    await call("setAdminRole", { email: "none@cms.test", role: "EDITOR" });
    assert.equal(
      (await adminAuth.getUser(users.NONE.uid)).customClaims?.role,
      "EDITOR",
    );
    await call("setAdminRole", { email: "none@cms.test", role: null });
    assert.equal(
      (await adminAuth.getUser(users.NONE.uid)).customClaims?.role,
      undefined,
    );
    assert.deepEqual(
      (await auditFor(users.NONE.uid)).map((entry) => entry.afterSummary.role),
      ["EDITOR", null],
    );
  });

  test("upload slots need a content role and configured R2 secrets", async () => {
    const request = {
      contentId: "cms-due",
      contentType: "image/png",
      bytes: 1024,
    };
    await rejects(
      users.ANALYST.call("requestUploadUrl", request),
      "permission-denied",
    );
    await rejects(
      users.EDITOR.call("requestUploadUrl", {
        ...request,
        contentType: "text/html",
      }),
      "invalid-argument",
    );
    await rejects(
      users.EDITOR.call("requestUploadUrl", { ...request, bytes: 1024 ** 3 }),
      "invalid-argument",
    );
    // The emulator has no R2 credentials, so no URL is ever issued here.
    await rejects(
      users.EDITOR.call("requestUploadUrl", request),
      "failed-precondition",
    );
  });
});
