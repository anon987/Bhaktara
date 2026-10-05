// Unit tests for the processMedia processor client. No network: fetch is a
// stub, and no Firestore access happens before the checks under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ProcessRequest,
  processMediaSchema,
} from "../../../src/domain/mediaProcessing";
import {
  httpProcessorClient,
  metadataIdToken,
  ProcessorCallError,
  processMedia,
  processorClientFromEnv,
} from "../../src/media";

const image = "staging/wp-1/11111111-2222-3333-4444-555555555555.png";
const request: ProcessRequest = {
  contentId: "wp-1",
  type: "wallpaper",
  inputs: { image },
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
type Call = { url: string; init?: RequestInit };
const recorder = (reply: (call: Call) => Response) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: URL | string, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
};

test("the client posts JSON with the identity token and validates the reply", async () => {
  const media = { thumb: { key: "wallpaper/wp-1/thumb.0123abcd.webp" } };
  const { calls, fetchImpl } = recorder(() => json(200, { media }));
  const client = httpProcessorClient({
    url: "https://processor.example/",
    idToken: async () => "id-token",
    fetchImpl,
  });
  assert.deepEqual(await client(request), { media });
  assert.equal(calls[0].url, "https://processor.example/v1/process");
  const headers = calls[0].init!.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer id-token");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init!.body)), request);

  const bad = httpProcessorClient({
    url: "https://processor.example",
    idToken: async () => "t",
    fetchImpl: recorder(() =>
      json(200, { media: { thumb: { key: "https://x/y" } } }),
    ).fetchImpl,
  });
  await assert.rejects(bad(request), ProcessorCallError);
});

test("processor errors keep their code and message", async () => {
  const client = httpProcessorClient({
    url: "https://processor.example",
    idToken: async () => "t",
    fetchImpl: recorder(() =>
      json(422, { error: { code: "INVALID_MEDIA", message: "Too short." } }),
    ).fetchImpl,
  });
  await assert.rejects(client(request), (error: ProcessorCallError) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, "INVALID_MEDIA");
    assert.equal(error.message, "Too short.");
    return true;
  });
});

test("identity tokens come from the metadata server for the audience", async () => {
  const { calls, fetchImpl } = recorder(
    () => new Response("header.payload.sig\n"),
  );
  const token = await metadataIdToken("https://processor.example", fetchImpl)();
  assert.equal(token, "header.payload.sig");
  const url = new URL(calls[0].url);
  assert.equal(url.host, "metadata.google.internal");
  assert.equal(url.searchParams.get("audience"), "https://processor.example");
  assert.equal(url.searchParams.get("format"), "full");
  assert.deepEqual(calls[0].init!.headers, { "Metadata-Flavor": "Google" });
});

test("configuration: HTTPS in production, loopback plus dev token in the emulator", async () => {
  assert.equal(processorClientFromEnv({}), null);
  assert.equal(
    processorClientFromEnv({ MEDIA_PROCESSOR_URL: "http://processor.example" }),
    null,
  );
  assert.ok(
    processorClientFromEnv({
      MEDIA_PROCESSOR_URL: "https://processor.example",
    }),
  );
  const emulator = {
    FUNCTIONS_EMULATOR: "true",
    MEDIA_PROCESSOR_DEV_TOKEN: "dev",
  };
  assert.equal(
    processorClientFromEnv({
      ...emulator,
      MEDIA_PROCESSOR_URL: "https://processor.example",
    }),
    null,
  );
  assert.equal(
    processorClientFromEnv({
      FUNCTIONS_EMULATOR: "true",
      MEDIA_PROCESSOR_URL: "http://127.0.0.1:5098",
    }),
    null,
  );
  const { calls, fetchImpl } = recorder(() =>
    json(200, {
      media: { thumb: { key: "wallpaper/wp-1/thumb.0123abcd.webp" } },
    }),
  );
  const client = processorClientFromEnv(
    { ...emulator, MEDIA_PROCESSOR_URL: "http://127.0.0.1:5098" },
    fetchImpl,
  );
  await client!(request);
  assert.equal(
    (calls[0].init!.headers as Record<string, string>).Authorization,
    "Bearer dev",
  );
});

test("callable input: staging keys of this item only, one original at least", () => {
  assert.ok(
    processMediaSchema.safeParse({ contentId: "wp-1", inputs: { image } })
      .success,
  );
  for (const inputs of [
    {},
    { image: image.replace("wp-1", "wp-2") },
    { image: "wallpaper/wp-1/full.0123abcd.jpg" },
    { image: image.replace(".png", ".mp3") },
    { audio: image },
    { image, extra: image },
  ])
    assert.equal(
      processMediaSchema.safeParse({ contentId: "wp-1", inputs }).success,
      false,
      JSON.stringify(inputs),
    );
});

test("the callable checks the role, then the input, then configuration", async () => {
  const data = { contentId: "wp-1", inputs: { image } };
  const never = async () => assert.fail("processor must not be called");
  for (const role of ["ANALYST", "MODERATOR"] as const)
    await assert.rejects(
      processMedia({ uid: "x", role }, data, { processor: never }),
      (error: HttpsError) => error.code === "permission-denied",
    );
  await assert.rejects(
    processMedia(
      { uid: "e", role: "EDITOR" },
      { contentId: "wp-1", inputs: {} },
      {
        processor: never,
      },
    ),
    (error: HttpsError) => error.code === "invalid-argument",
  );
  await assert.rejects(
    processMedia({ uid: "e", role: "EDITOR" }, data, { processor: null }),
    (error: HttpsError) => error.code === "failed-precondition",
  );
});
