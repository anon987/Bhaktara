// HTTP contract of the processor with the verifier and pipeline stubbed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { ProcessRequest } from "../../../src/domain/mediaProcessing";
import { AuthError, Verifier } from "../src/auth";
import { memoryLogger } from "../src/log";
import { ProcessorError } from "../src/processor";
import { createProcessorServer, MAX_BODY_BYTES } from "../src/server";
import { fsStore } from "../src/store";

const TOKEN = "good-token";
const verify: Verifier = async (authorization) => {
  if (authorization === `Bearer ${TOKEN}`) return { email: "fn@sa" };
  if (authorization === "Bearer other") throw new AuthError(403, "Not you.");
  throw new AuthError(401, "No token.");
};
const calls: ProcessRequest[] = [];
let behaviour: "ok" | "invalid" | "crash" = "ok";
const { entries, logger } = memoryLogger();
let server: Server;
let base: string;

const image = "staging/wp-1/11111111-2222-3333-4444-555555555555.png";
const valid = { contentId: "wp-1", type: "wallpaper", inputs: { image } };
type ErrorBody = {
  error: { code: string; message: string; issues?: unknown };
};
const errorOf = async (response: Response) =>
  ((await response.json()) as ErrorBody).error;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

before(async () => {
  server = createProcessorServer({
    verify,
    store: fsStore("/nonexistent-processor-test"),
    log: logger,
    process: async (request) => {
      calls.push(request);
      if (behaviour === "invalid")
        throw new ProcessorError(422, "INVALID_MEDIA", "Too short.");
      if (behaviour === "crash")
        throw new Error("ffmpeg failed (1): /tmp/processor-x/input.png broken");
      return {
        media: { thumb: { key: "wallpaper/wp-1/thumb.0123abcd.webp" } },
      };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test("health and routing", async () => {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  const get = await fetch(`${base}/v1/process`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
});

test("authentication comes before anything else", async () => {
  const none = await post(valid, { Authorization: "" });
  assert.equal(none.status, 401);
  assert.equal((await errorOf(none)).code, "UNAUTHENTICATED");
  const other = await post(valid, { Authorization: "Bearer other" });
  assert.equal(other.status, 403);
  assert.equal((await errorOf(other)).code, "FORBIDDEN");
  // Even an invalid body gets 401 without a token.
  assert.equal((await post("{", { Authorization: "" })).status, 401);
  assert.equal(calls.length, 0);
});

test("strict input validation", async () => {
  const bad = [
    "{not json",
    { ...valid, extra: true },
    { ...valid, inputs: { image: "wallpaper/wp-1/full.0123abcd.png" } },
    {
      ...valid,
      inputs: {
        image: "staging/other/11111111-2222-3333-4444-555555555555.png",
      },
    },
    { ...valid, inputs: { image: "staging/wp-1/../../etc/passwd" } },
    { ...valid, inputs: { image: image.replace(".png", ".svg") } },
    { ...valid, inputs: { audio: image.replace(".png", ".mp3") } },
    { ...valid, inputs: {} },
    { ...valid, type: "podcast" },
    { ...valid, contentId: "../wp" },
    { ...valid, type: "status", inputs: { audio: image.replace(".png", ".mp3") } },
  ];
  for (const body of bad) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await errorOf(response)).code, "INVALID_REQUEST");
  }
  const { issues } = await errorOf(
    await post({ ...valid, inputs: { audio: image.replace(".png", ".mp3") } }),
  );
  assert.deepEqual(issues, [
    { path: "inputs.image", message: "wallpaper needs an uploaded image file" },
    { path: "inputs.audio", message: "wallpaper does not take an audio file" },
  ]);
  assert.equal(
    (await post(valid, { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (await post(JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) }))).status,
    413,
  );
  assert.equal(calls.length, 0);
});

test("success returns the media object", async () => {
  behaviour = "ok";
  const response = await post(valid);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    media: { thumb: { key: "wallpaper/wp-1/thumb.0123abcd.webp" } },
  });
  assert.deepEqual(calls.at(-1), valid);
});

test("validation failures are explained; internal ones are not", async () => {
  behaviour = "invalid";
  const invalid = await post(valid);
  assert.equal(invalid.status, 422);
  assert.deepEqual(await invalid.json(), {
    error: { code: "INVALID_MEDIA", message: "Too short." },
  });
  behaviour = "crash";
  const crash = await post(valid);
  assert.equal(crash.status, 500);
  assert.deepEqual(await crash.json(), {
    error: { code: "INTERNAL", message: "Processing failed." },
  });
});

test("logs never contain the token or the environment", () => {
  const text = JSON.stringify(entries);
  assert.ok(entries.length > 0);
  assert.ok(!text.includes(TOKEN));
  assert.ok(!text.includes("Bearer"));
  for (const [name, value] of Object.entries(process.env))
    if (/SECRET|KEY|TOKEN|PASSWORD/i.test(name) && value && value.length > 6)
      assert.ok(!text.includes(value), name);
});
