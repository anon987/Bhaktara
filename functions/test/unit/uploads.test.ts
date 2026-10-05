// Unit tests for presigned R2 upload slots. No network and no real
// credentials: the S3 client is a stub whose send() must never be called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import { requestUploadSchema } from "../../../src/domain/cms";
import {
  buildUploadSlot,
  Presign,
  r2Client,
  r2ConfigFromEnv,
  requestUploadUrl,
  s3Presigner,
  UPLOAD_TTL_SECONDS,
} from "../../src/uploads";

const fakeConfig = {
  accountId: "test-account",
  bucket: "bhaktara-media-test",
  accessKeyId: "TEST_ACCESS_KEY_ID",
  secretAccessKey: "test-secret-access-key-not-real",
};
const stubClient = async () => {
  const client = await r2Client(fakeConfig);
  client.send = (() => {
    throw new Error("presigning must not make network calls");
  }) as never;
  return client;
};
const request = requestUploadSchema.parse({
  contentId: "wp-0142",
  contentType: "image/png",
  bytes: 2048,
});

test("R2 config needs all four values from the environment", () => {
  assert.equal(r2ConfigFromEnv({}), null);
  assert.equal(
    r2ConfigFromEnv({
      R2_ACCOUNT_ID: "a",
      R2_BUCKET: "b",
      R2_ACCESS_KEY_ID: "c",
    }),
    null,
  );
  assert.deepEqual(
    r2ConfigFromEnv({
      R2_ACCOUNT_ID: "a",
      R2_BUCKET: "b",
      R2_ACCESS_KEY_ID: "c",
      R2_SECRET_ACCESS_KEY: "d",
    }),
    { accountId: "a", bucket: "b", accessKeyId: "c", secretAccessKey: "d" },
  );
});

test("upload slots are scoped to staging/, typed, sized and short-lived", async () => {
  const calls: Parameters<Presign>[0][] = [];
  const presign: Presign = async (input) => {
    calls.push(input);
    return "https://signed.example/upload";
  };
  const now = new Date("2026-10-05T00:00:00.000Z");
  const slot = await buildUploadSlot(request, {
    presign,
    bucket: "bucket",
    now,
    id: "11111111-2222-3333-4444-555555555555",
  });
  assert.deepEqual(slot, {
    key: "staging/wp-0142/11111111-2222-3333-4444-555555555555.png",
    url: "https://signed.example/upload",
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    expiresAt: "2026-10-05T00:10:00.000Z",
  });
  assert.deepEqual(calls, [
    {
      bucket: "bucket",
      key: slot.key,
      contentType: "image/png",
      bytes: 2048,
      expiresIn: UPLOAD_TTL_SECONDS,
    },
  ]);
  // Random IDs by default: two slots never share a key.
  const a = await buildUploadSlot(request, { presign, bucket: "b", now });
  const b = await buildUploadSlot(request, { presign, bucket: "b", now });
  assert.match(a.key, /^staging\/wp-0142\/[0-9a-f-]{36}\.png$/);
  assert.notEqual(a.key, b.key);
});

test("the S3 presigner signs a PUT with type and length, offline", async () => {
  const url = new URL(
    await s3Presigner(
      fakeConfig,
      await stubClient(),
    )({
      bucket: fakeConfig.bucket,
      key: "staging/wp-0142/abc.png",
      contentType: "image/png",
      bytes: 2048,
      expiresIn: UPLOAD_TTL_SECONDS,
    }),
  );
  assert.equal(url.host, "test-account.r2.cloudflarestorage.com");
  assert.equal(url.pathname, "/bhaktara-media-test/staging/wp-0142/abc.png");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.deepEqual(
    url.searchParams.get("X-Amz-SignedHeaders")?.split(";").sort(),
    ["content-length", "content-type", "host"],
  );
  assert.ok(url.searchParams.get("X-Amz-Signature"));
  assert.ok(!url.toString().includes(fakeConfig.secretAccessKey));
});

test("requests are validated: type whitelist, size limits, slug IDs", () => {
  for (const bad of [
    { contentId: "wp-0142", contentType: "text/html", bytes: 10 },
    { contentId: "wp-0142", contentType: "image/png", bytes: 41 * 1024 ** 2 },
    { contentId: "../etc", contentType: "image/png", bytes: 10 },
    { contentId: "wp-0142", contentType: "image/png", bytes: 0 },
  ])
    assert.equal(requestUploadSchema.safeParse(bad).success, false);
  assert.ok(
    requestUploadSchema.safeParse({
      contentId: "status-1",
      contentType: "video/mp4",
      bytes: 250 * 1024 ** 2,
    }).success,
  );
});

test("the callable checks the role before configuration", async () => {
  const data = { contentId: "wp-0142", contentType: "image/png", bytes: 10 };
  await assert.rejects(
    requestUploadUrl({ uid: "a", role: "ANALYST" }, data, {}),
    (error: HttpsError) => error.code === "permission-denied",
  );
  await assert.rejects(
    requestUploadUrl({ uid: "e", role: "EDITOR" }, data, {}),
    (error: HttpsError) => error.code === "failed-precondition",
  );
});
