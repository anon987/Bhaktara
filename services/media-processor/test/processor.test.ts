// Integration tests: the real ffmpeg pipeline (scripts/media) against a
// filesystem-backed fake bucket. No network and no credentials.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, rm, stat, truncate } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ProcessRequest } from "../../../src/domain/mediaProcessing";
import { memoryLogger } from "../src/log";
import {
  defaultLimits,
  ProcessorError,
  processUpload,
  receiptKey,
} from "../src/processor";
import { fsStore } from "../src/store";
import { gradient, scratch, stagingKey, testClip, tone } from "./fixtures";

let root: string;
let sources: string;
let bucket: string;
const { logger } = memoryLogger();
const deps = () => ({ store: fsStore(bucket), log: logger, workRoot: root });
const exists = (key: string) =>
  stat(join(bucket, key)).then(
    () => true,
    () => false,
  );
// "Upload" a local file into the fake bucket's staging prefix.
async function stage(contentId: string, file: string, ext: string) {
  const key = stagingKey(contentId, ext);
  await mkdir(dirname(join(bucket, key)), { recursive: true });
  await copyFile(file, join(bucket, key));
  return key;
}
async function refused(
  promise: Promise<unknown>,
  status: number,
  code: string,
  message?: RegExp,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ProcessorError, String(error));
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}

before(async () => {
  root = await scratch();
  sources = join(root, "sources");
  bucket = join(root, "bucket");
  await gradient(join(sources, "master.png"), 1080, 2400);
  await gradient(join(sources, "cover.png"), 400, 400);
  await tone(join(sources, "tone5.wav"), 5);
  await tone(join(sources, "tone10.wav"), 10);
  await testClip(join(sources, "clip16.mp4"), 16);
});
after(() => rm(root, { recursive: true, force: true }));

describe("processUpload", () => {
  test("wallpaper: variants under final keys, staging deleted, retry-safe", async () => {
    const image = await stage("wp-1", join(sources, "master.png"), "png");
    const request: ProcessRequest = {
      contentId: "wp-1",
      type: "wallpaper",
      inputs: { image },
    };
    const result = await processUpload(request, deps());
    assert.deepEqual(Object.keys(result.media).sort(), [
      "full",
      "mobile",
      "thumb",
    ]);
    assert.match(
      result.media.mobile!.key,
      /^wallpaper\/wp-1\/mobile\.[0-9a-f]{8}\.webp$/,
    );
    assert.equal(result.media.mobile!.width, 1080);
    assert.equal(result.media.mobile!.height, 2400);
    assert.equal(result.media.full!.mime, "image/jpeg");
    assert.equal("durationSeconds" in result, false);
    // 1080×2400 is accepted but below the recommended 1440×3200 master.
    assert.match(result.warnings![0], /1440×3200/);
    for (const variant of Object.values(result.media))
      assert.ok(await exists(variant!.key), variant!.key);
    assert.equal(await exists(image), false, "staging original deleted");
    assert.ok(await exists(receiptKey(request)));

    // A retry (e.g. the callable timed out) gets the same answer even though
    // the original is gone.
    assert.deepEqual(await processUpload(request, deps()), result);
  });

  test("bhajan: AAC stream with duration plus a square thumb", async () => {
    const audio = await stage("bhajan-1", join(sources, "tone5.wav"), "wav");
    const image = await stage("bhajan-1", join(sources, "cover.png"), "png");
    const result = await processUpload(
      { contentId: "bhajan-1", type: "bhajan", inputs: { audio, image } },
      deps(),
    );
    assert.equal(result.media.stream!.mime, "audio/mp4");
    assert.match(
      result.media.stream!.key,
      /^bhajan\/bhajan-1\/stream\.[0-9a-f]{8}\.m4a$/,
    );
    assert.ok(Math.abs(result.durationSeconds! - 5) < 0.5);
    assert.equal(result.media.thumb!.width, 320);
    assert.equal(await exists(audio), false);
    assert.equal(await exists(image), false);
  });

  test("status: 720p H.264 video, poster and thumb", async () => {
    const video = await stage("status-1", join(sources, "clip16.mp4"), "mp4");
    const result = await processUpload(
      { contentId: "status-1", type: "status", inputs: { video } },
      deps(),
    );
    assert.deepEqual(Object.keys(result.media).sort(), [
      "poster",
      "thumb",
      "video720",
    ]);
    assert.equal(result.media.video720!.width, 720);
    assert.equal(result.media.video720!.height, 1280);
    assert.ok(Math.abs(result.durationSeconds! - 16) < 0.5);
  });

  test("production rules reject the file and keep the staging original", async () => {
    const audio = await stage("ring-1", join(sources, "tone10.wav"), "wav");
    const image = await stage("ring-1", join(sources, "cover.png"), "png");
    const request: ProcessRequest = {
      contentId: "ring-1",
      type: "ringtone",
      inputs: { audio, image },
    };
    await refused(
      processUpload(request, deps()),
      422,
      "INVALID_MEDIA",
      /Ringtones must be 20–30 s/,
    );
    assert.ok(await exists(audio), "original kept for another attempt");
    assert.equal(await exists(receiptKey(request)), false);
  });

  test("a file that is not what its role says is rejected", async () => {
    // A PNG uploaded under an audio key.
    const audio = await stage("bhajan-2", join(sources, "cover.png"), "mp3");
    const image = await stage("bhajan-2", join(sources, "cover.png"), "png");
    await refused(
      processUpload(
        { contentId: "bhajan-2", type: "bhajan", inputs: { audio, image } },
        deps(),
      ),
      422,
      "INVALID_MEDIA",
      /audio/,
    );
    // Audio uploaded under an image key.
    const notImage = await stage("wp-2", join(sources, "tone5.wav"), "png");
    await refused(
      processUpload(
        { contentId: "wp-2", type: "wallpaper", inputs: { image: notImage } },
        deps(),
      ),
      422,
      "INVALID_MEDIA",
    );
  });

  test("dimension and duration limits apply before rendering", async () => {
    const image = await stage("wp-3", join(sources, "master.png"), "png");
    await refused(
      processUpload(
        { contentId: "wp-3", type: "wallpaper", inputs: { image } },
        { ...deps(), limits: { ...defaultLimits, maxImageSide: 2000 } },
      ),
      422,
      "INVALID_MEDIA",
      /limit is 2000 px/,
    );
    const video = await stage("status-2", join(sources, "clip16.mp4"), "mp4");
    await refused(
      processUpload(
        { contentId: "status-2", type: "status", inputs: { video } },
        { ...deps(), limits: { ...defaultLimits, maxVideoSeconds: 10 } },
      ),
      422,
      "INVALID_MEDIA",
      /limit is 10 s/,
    );
  });

  test("missing and oversized originals", async () => {
    await refused(
      processUpload(
        {
          contentId: "wp-4",
          type: "wallpaper",
          inputs: { image: stagingKey("wp-4", "png") },
        },
        deps(),
      ),
      404,
      "NOT_FOUND",
    );
    // A sparse 41 MB file: over the 40 MB image limit without writing it.
    const image = stagingKey("wp-5", "png");
    await mkdir(dirname(join(bucket, image)), { recursive: true });
    await copyFile(join(sources, "cover.png"), join(bucket, image));
    await truncate(join(bucket, image), 41 * 1024 * 1024);
    await refused(
      processUpload(
        { contentId: "wp-5", type: "wallpaper", inputs: { image } },
        deps(),
      ),
      413,
      "TOO_LARGE",
    );
  });
});
