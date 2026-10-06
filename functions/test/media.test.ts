// Integration tests for the processMedia callable in the Functions emulator.
// The Cloud Run processor is stubbed by a local HTTP server started here;
// `npm run test:functions` points the emulated function at it through
// MEDIA_PROCESSOR_URL and MEDIA_PROCESSOR_DEV_TOKEN (loopback only).
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initAdmin,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
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
import type { ProcessRequest } from "../../src/domain/mediaProcessing";

const projectId = "demo-bhaktara";
process.env.GCLOUD_PROJECT ??= projectId;
const adminApp = initAdmin({ projectId }, "media-test-admin");
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clients: FirebaseApp[] = [];

const processorUrl = new URL(process.env.MEDIA_PROCESSOR_URL ?? "");
const devToken = process.env.MEDIA_PROCESSOR_DEV_TOKEN ?? "";

// ---- Stub processor: records requests; behaviour chosen per content ID.
const received: { authorization?: string; body: ProcessRequest }[] = [];
let processor: Server;
const variant = (type: string, id: string, name: string, ext: string) => ({
  key: `${type}/${id}/${name}.0123abcd.${ext}`,
  bytes: 1000,
  mime: ext === "webp" ? "image/webp" : "audio/mp4",
});
function reply(body: ProcessRequest): [number, unknown] {
  const { contentId: id, type } = body;
  if (id === "media-invalid")
    return [
      422,
      {
        error: {
          code: "INVALID_MEDIA",
          message: "Ringtones must be 20–30 s (doc 12 §6); got 10 s",
        },
      },
    ];
  if (id === "media-crash")
    return [
      500,
      { error: { code: "INTERNAL", message: "Processing failed." } },
    ];
  if (id === "media-foreign")
    return [
      200,
      {
        media: { thumb: variant("wallpaper", "someone-else", "thumb", "webp") },
      },
    ];
  if (type === "bhajan")
    return [
      200,
      {
        media: {
          stream: {
            ...variant(type, id, "stream", "m4a"),
            durationSeconds: 312.4,
          },
          thumb: variant(type, id, "thumb", "webp"),
        },
        durationSeconds: 312.4,
      },
    ];
  return [
    200,
    {
      media: {
        thumb: variant(type, id, "thumb", "webp"),
        mobile: variant(type, id, "mobile", "webp"),
        full: { ...variant(type, id, "full", "jpg"), mime: "image/jpeg" },
      },
      warnings: ["Master is 1080×2400; doc 12 §6 asks for 1440×3200+."],
    },
  ];
}

type Caller = <T = unknown>(name: string, data?: unknown) => Promise<T>;
const users = {} as Record<
  "EDITOR" | "CONTENT_ADMIN" | "ANALYST" | "MODERATOR",
  { uid: string; call: Caller }
>;

async function signIn(email: string) {
  const app = initializeApp(
    { projectId, apiKey: "demo-key" },
    `media-client-${clients.length}`,
  );
  clients.push(app);
  connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  const functions = getFunctions(app, "asia-south1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  const credential = await signInWithEmailAndPassword(
    getAuth(app),
    email,
    "password-123",
  );
  const call: Caller = async (name, data) =>
    (await httpsCallable(functions, name, { timeout: 30_000 })(data))
      .data as never;
  return { uid: credential.user.uid, call };
}

async function rejects(
  promise: Promise<unknown>,
  code: string,
  message?: RegExp,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof FunctionsError, String(error));
    assert.equal(error.code, `functions/${code}`, error.message);
    if (message) assert.match(error.message, message);
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
    .filter((entry) => entry.action === "media.process");
}

const staging = (id: string, ext: string, n = 1) =>
  `staging/${id}/${String(n).repeat(8)}-2222-3333-4444-555555555555.${ext}`;
async function seed(
  id: string,
  type: string,
  status: string,
  media: object = {},
) {
  await db.doc(`content/${id}`).set({
    type,
    status,
    title: { hi: "शीर्षक", en: "Title" },
    description: { hi: "विवरण", en: "Description" },
    deityIds: ["hanuman"],
    categoryIds: [],
    tags: [],
    media,
    isFeatured: false,
    saveGate: "FREE",
    isShareable: true,
    adEligible: true,
    popularityScore: 0,
  });
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.ok(["127.0.0.1", "localhost"].includes(processorUrl.hostname));
  assert.ok(devToken, "MEDIA_PROCESSOR_DEV_TOKEN is set by test:functions");
  processor = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text) as ProcessRequest;
    received.push({ authorization: request.headers.authorization, body });
    const [status, payload] = reply(body);
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) =>
    processor.listen(Number(processorUrl.port), processorUrl.hostname, resolve),
  );
  for (const role of Object.keys({
    EDITOR: 1,
    CONTENT_ADMIN: 1,
    ANALYST: 1,
    MODERATOR: 1,
  }) as (keyof typeof users)[]) {
    const email = `${role.toLowerCase()}@media.test`;
    const existing = await adminAuth.getUserByEmail(email).catch(() => null);
    const user =
      existing ??
      (await adminAuth.createUser({ email, password: "password-123" }));
    await adminAuth.setCustomUserClaims(user.uid, { role });
    users[role] = await signIn(email);
  }
  // Warm up the emulated function (a cold start can exceed the call timeout).
  for (let attempt = 1; ; attempt++) {
    const code = await users.ANALYST.call("processMedia", {}).then(
      () => "ok",
      (error: { code?: string }) => error.code,
    );
    if (code === "functions/permission-denied") break;
    if (attempt === 5) assert.fail(`processMedia did not start: ${code}`);
  }
});

beforeEach(() => {
  received.length = 0;
});

after(async () => {
  await new Promise((resolve) => processor.close(resolve));
  await Promise.all(clients.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

describe("processMedia", () => {
  test("only content editors may process media", async () => {
    await seed("media-roles", "WALLPAPER", "DRAFT");
    const data = {
      contentId: "media-roles",
      inputs: { image: staging("media-roles", "png") },
    };
    await rejects(
      users.ANALYST.call("processMedia", data),
      "permission-denied",
    );
    await rejects(
      users.MODERATOR.call("processMedia", data),
      "permission-denied",
    );
    assert.equal(received.length, 0);
    assert.deepEqual(await auditFor("media-roles"), []);
  });

  test("only DRAFT content can take new media", async () => {
    for (const status of ["READY", "SCHEDULED", "PUBLISHED", "ARCHIVED"]) {
      await seed("media-live", "WALLPAPER", status);
      await rejects(
        users.CONTENT_ADMIN.call("processMedia", {
          contentId: "media-live",
          inputs: { image: staging("media-live", "png") },
        }),
        "failed-precondition",
        /Move it back to DRAFT/,
      );
    }
    assert.equal(received.length, 0);
    await rejects(
      users.EDITOR.call("processMedia", {
        contentId: "media-missing",
        inputs: { image: staging("media-missing", "png") },
      }),
      "not-found",
    );
  });

  test("inputs must be this item's staging uploads, as the type requires", async () => {
    await seed("media-inputs", "BHAJAN", "DRAFT");
    for (const inputs of [
      { image: staging("other-item", "png") },
      { image: "bhajan/media-inputs/thumb.0123abcd.webp" },
      { image: "staging/media-inputs/../../secret.png" },
      // A bhajan takes audio and a cover image, never a video.
      { video: staging("media-inputs", "mp4") },
    ])
      await rejects(
        users.EDITOR.call("processMedia", {
          contentId: "media-inputs",
          inputs,
        }),
        "invalid-argument",
      );
    assert.equal(received.length, 0);
  });

  test("an editor processes a wallpaper: media written with an audit entry", async () => {
    const keep = { key: "placeholder/wallpaper/x.webp" };
    await seed("media-wall", "WALLPAPER", "DRAFT", {
      thumb: { key: "wallpaper/media-wall/thumb.ffffffff.webp" },
      poster: keep,
    });
    const image = staging("media-wall", "png");
    const result = await users.EDITOR.call<{
      media: Record<string, { key: string }>;
      warnings: string[];
      changed: boolean;
    }>("processMedia", { contentId: "media-wall", inputs: { image } });
    assert.equal(result.changed, true);
    assert.match(result.warnings[0], /1440×3200/);

    // The processor got the type from the stored document and the dev token.
    assert.deepEqual(
      received.map((call) => call.body),
      [{ contentId: "media-wall", type: "wallpaper", inputs: { image } }],
    );
    assert.equal(received[0].authorization, `Bearer ${devToken}`);

    const stored = (await db.doc("content/media-wall").get()).data()!;
    assert.equal(stored.status, "DRAFT");
    assert.equal(
      stored.media.thumb.key,
      "wallpaper/media-wall/thumb.0123abcd.webp",
    );
    assert.equal(stored.media.full.mime, "image/jpeg");
    assert.deepEqual(stored.media.poster, keep, "unrelated slots are kept");
    assert.deepEqual(result.media, stored.media);

    const [audit, ...rest] = await auditFor("media-wall");
    assert.equal(rest.length, 0);
    assert.equal(audit.adminUid, users.EDITOR.uid);
    assert.equal(audit.entity, "content");
    assert.deepEqual(audit.beforeSummary, {
      media: {
        poster: keep.key,
        thumb: "wallpaper/media-wall/thumb.ffffffff.webp",
      },
    });
    assert.deepEqual(audit.afterSummary.media, {
      full: "wallpaper/media-wall/full.0123abcd.jpg",
      mobile: "wallpaper/media-wall/mobile.0123abcd.webp",
      thumb: "wallpaper/media-wall/thumb.0123abcd.webp",
    });
    assert.deepEqual(audit.afterSummary.inputs, { image });

    // A retry with the same result changes nothing and adds no audit entry.
    const again = await users.EDITOR.call<{ changed: boolean }>(
      "processMedia",
      {
        contentId: "media-wall",
        inputs: { image },
      },
    );
    assert.equal(again.changed, false);
    assert.equal((await auditFor("media-wall")).length, 1);
  });

  test("audio sets the content duration", async () => {
    await seed("media-bhajan", "BHAJAN", "DRAFT");
    await users.CONTENT_ADMIN.call("processMedia", {
      contentId: "media-bhajan",
      inputs: {
        audio: staging("media-bhajan", "wav"),
        image: staging("media-bhajan", "png", 2),
      },
    });
    assert.equal(received[0].body.type, "bhajan");
    const stored = (await db.doc("content/media-bhajan").get()).data()!;
    assert.equal(stored.durationSeconds, 312.4);
    assert.equal(
      stored.media.stream.key,
      "bhajan/media-bhajan/stream.0123abcd.m4a",
    );
  });

  test("processor failures leave the document and the audit log untouched", async () => {
    await seed("media-invalid", "RINGTONE", "DRAFT");
    await rejects(
      users.EDITOR.call("processMedia", {
        contentId: "media-invalid",
        inputs: {
          audio: staging("media-invalid", "mp3"),
          image: staging("media-invalid", "png", 2),
        },
      }),
      "failed-precondition",
      /Ringtones must be 20–30 s/,
    );
    await seed("media-crash", "WALLPAPER", "DRAFT");
    await rejects(
      users.EDITOR.call("processMedia", {
        contentId: "media-crash",
        inputs: { image: staging("media-crash", "png") },
      }),
      "unavailable",
    );
    // Keys for another item are refused even if the processor returns them.
    await seed("media-foreign", "WALLPAPER", "DRAFT");
    await rejects(
      users.EDITOR.call("processMedia", {
        contentId: "media-foreign",
        inputs: { image: staging("media-foreign", "png") },
      }),
      "unavailable",
    );
    for (const id of ["media-invalid", "media-crash", "media-foreign"]) {
      assert.deepEqual((await db.doc(`content/${id}`).get()).data()!.media, {});
      assert.deepEqual(await auditFor(id), []);
    }
  });
});
