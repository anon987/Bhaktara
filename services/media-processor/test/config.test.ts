// R2 adapter (S3 client stubbed: no network) and startup configuration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  IMMUTABLE,
  ObjectTooLargeError,
  r2Bucket,
} from "../../../scripts/media/r2";
import { configFromEnv } from "../src/main";
import { scratch } from "./fixtures";

const fakeConfig = {
  accountId: "test-account",
  bucket: "bhaktara-media-test",
  accessKeyId: "TEST_ACCESS_KEY_ID",
  secretAccessKey: "test-secret-access-key-not-real",
};
const notFound = () =>
  Object.assign(new Error("NotFound"), { $metadata: { httpStatusCode: 404 } });

// A stand-in S3 client. Commands are matched by name: they come from the
// SDK copy that scripts/media/r2.ts resolves.
function stubbed(objects: Map<string, Buffer>) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const send = async (command: { input: Record<string, unknown> }) => {
    const key = command.input.Key as string;
    const name = command.constructor.name;
    sent.push({ name, input: command.input });
    const body = objects.get(key);
    if (name === "HeadObjectCommand") {
      if (!body) throw notFound();
      return { ContentLength: body.length };
    }
    if (name === "GetObjectCommand") {
      if (!body) throw notFound();
      return {
        ContentLength: body.length,
        Body: Object.assign(Readable.from([body]), {
          transformToString: async () => body.toString("utf8"),
        }),
      };
    }
    if (name === "PutObjectCommand") {
      objects.set(key, Buffer.from(command.input.Body as Buffer | string));
      return {};
    }
    if (name === "DeleteObjectCommand") {
      objects.delete(key);
      return {};
    }
    throw new Error(`unexpected ${name}`);
  };
  return { bucket: r2Bucket(fakeConfig, { send } as never), sent };
}

test("R2: immutable puts, bounded downloads, JSON receipts, deletes", async () => {
  const objects = new Map<string, Buffer>();
  const { bucket, sent } = stubbed(objects);
  const body = Buffer.from("variant-bytes");
  assert.equal(
    await bucket.putImmutable(
      "wallpaper/w/thumb.0123abcd.webp",
      body,
      "image/webp",
    ),
    "uploaded",
  );
  const put = sent.find((call) => call.name === "PutObjectCommand")!;
  assert.equal(put.input.CacheControl, IMMUTABLE);
  assert.equal(put.input.ContentType, "image/webp");
  assert.equal(
    await bucket.putImmutable(
      "wallpaper/w/thumb.0123abcd.webp",
      body,
      "image/webp",
    ),
    "exists",
  );

  const dir = await scratch();
  try {
    objects.set("staging/w/a.png", Buffer.alloc(100, 1));
    assert.equal(
      await bucket.download("staging/w/a.png", join(dir, "a"), 100),
      100,
    );
    assert.equal((await readFile(join(dir, "a"))).length, 100);
    await assert.rejects(
      bucket.download("staging/w/a.png", join(dir, "b"), 99),
      ObjectTooLargeError,
    );
    assert.equal(
      await bucket.download("staging/w/none.png", join(dir, "c"), 99),
      null,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.equal(await bucket.getJson("staging/w/receipts/x.json"), null);
  await bucket.putJson("staging/w/receipts/x.json", { ok: 1 });
  assert.deepEqual(await bucket.getJson("staging/w/receipts/x.json"), {
    ok: 1,
  });
  assert.equal(await bucket.head("staging/w/a.png").then((h) => h?.bytes), 100);
  await bucket.remove("staging/w/a.png");
  assert.equal(await bucket.head("staging/w/a.png"), null);
});

test("startup config: Cloud Run needs R2 and OIDC settings; errors name, never show, values", () => {
  assert.throws(
    () => configFromEnv({ R2_ACCESS_KEY_ID: "AKIA-SECRET-VALUE" }),
    (error: Error) =>
      error.message.includes("R2_ACCOUNT_ID") &&
      error.message.includes("PROCESSOR_AUDIENCE") &&
      error.message.includes("INVOKER_SERVICE_ACCOUNT") &&
      !error.message.includes("AKIA-SECRET-VALUE"),
  );
  const cloud = configFromEnv({
    R2_ACCOUNT_ID: "acct",
    R2_BUCKET: "bhaktara-media-dev",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secret",
    PROCESSOR_AUDIENCE: "https://processor.example",
    INVOKER_SERVICE_ACCOUNT: "fn@example.iam.gserviceaccount.com",
  });
  assert.equal(cloud.store.label, "r2:bhaktara-media-dev");
});

test("startup config: the local token mode is refused on Cloud Run or with R2 keys", () => {
  const local = {
    MEDIA_STORE_DIR: "/tmp/bucket",
    LOCAL_DEV_TOKEN: "local-dev-token-0123456789",
  };
  assert.equal(configFromEnv(local).store.label, "local");
  assert.throws(() =>
    configFromEnv({ ...local, K_SERVICE: "media-processor" }),
  );
  assert.throws(() => configFromEnv({ ...local, R2_SECRET_ACCESS_KEY: "x" }));
  assert.throws(() => configFromEnv({ ...local, LOCAL_DEV_TOKEN: "short" }));
  assert.throws(() => configFromEnv({ MEDIA_STORE_DIR: "/tmp/bucket" }));
});
