// Unit tests for localizeText (Gemini on Vertex AI). No network and no real
// credentials: a key pair is generated per run and every HTTP call goes to a
// fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import {
  DEFAULT_GEMINI_MODEL,
  Gemini,
  geminiConfigFromEnv,
  geminiFromEnv,
  generateContentUrl,
  serviceAccountJwt,
  serviceAccountToken,
  TOKEN_URL,
  vertexGemini,
} from "../../src/gemini";
import { localizeText, MAX_LYRICS_OUTPUT_TOKENS } from "../../src/localize";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const config = {
  project: "bhaktara-test",
  clientEmail: "titles@bhaktara-test.iam.gserviceaccount.com",
  keyId: "test-key-id",
  privateKey,
  model: "gemini-test-model",
};
const env = {
  GEMINI_PROJECT: config.project,
  GEMINI_SA_EMAIL: config.clientEmail,
  GEMINI_SA_KEY_ID: config.keyId,
  // As stored in .env files: one line with escaped newlines.
  GEMINI_SA_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  GEMINI_MODEL: config.model,
};
const editor = { uid: "e", role: "EDITOR" } as const;

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

// What a well-behaved model answers for each text.
const answers: Record<string, { language: "hi" | "en"; hi: string; en: string }> = {
  "Om Jai Jagdish Hare": { language: "en", hi: "ॐ जय जगदीश हरे", en: "Om Jai Jagdish Hare" },
  "Hanuman Chalisa fast version": {
    language: "en",
    hi: "हनुमान चालीसा तेज़ संस्करण",
    en: "Hanuman Chalisa fast version",
  },
  "राम का नाम लिए जा": { language: "hi", hi: "राम का नाम लिए जा", en: "Ram Ka Naam Liye Ja" },
  "जय गणेश जय गणेश देवा": {
    language: "hi",
    hi: "जय गणेश जय गणेश देवा",
    en: "Jai Ganesh Jai Ganesh Deva",
  },
  "माता जाकी पार्वती": { language: "hi", hi: "माता जाकी पार्वती", en: "Mata Jaki Parvati" },
  "पिता महादेवा": { language: "hi", hi: "पिता महादेवा", en: "Pita Mahadeva" },
};
const itemsOf = (body: { contents: { parts: { text: string }[] }[] }): string[] => {
  const prompt = body.contents[0].parts[0].text;
  return JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
};

type Call = { url: string; init: RequestInit; body?: Record<string, any> };
// Answers the token endpoint and Vertex AI; records every call.
function fakeGoogle(
  reply: (items: string[]) => unknown = (items) => ({
    items: items.map((item) => answers[item]),
  }),
  generate?: (body: Record<string, any>) => Response | undefined,
) {
  const calls: Call[] = [];
  let tokens = 0;
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    if (String(url) === TOKEN_URL) {
      calls.push({ url: String(url), init });
      tokens += 1;
      return Response.json({ access_token: `token-${tokens}`, expires_in: 3600 });
    }
    const body = JSON.parse(String(init.body));
    calls.push({ url: String(url), init, body });
    const custom = generate?.(body);
    if (custom) return custom;
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { role: "model", parts: [{ text: JSON.stringify(reply(itemsOf(body))) }] },
        },
      ],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 0 },
    });
  }) as typeof fetch;
  return {
    calls,
    fetchImpl,
    tokenCalls: () => calls.filter((call) => call.url === TOKEN_URL),
    generateCalls: () => calls.filter((call) => call.url !== TOKEN_URL),
  };
}

test("config needs the four credentials, unescapes the key and defaults the model", () => {
  assert.equal(geminiConfigFromEnv({}), null);
  assert.equal(geminiConfigFromEnv({ ...env, GEMINI_SA_KEY_ID: "" }), null);
  const parsed = geminiConfigFromEnv(env);
  assert.ok(parsed);
  assert.equal(parsed.privateKey, privateKey.trim());
  assert.ok(!parsed.privateKey.includes("\\n"));
  assert.equal(parsed.model, "gemini-test-model");
  assert.equal(geminiConfigFromEnv({ ...env, GEMINI_MODEL: undefined })?.model, DEFAULT_GEMINI_MODEL);
  assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.1-flash-lite");
});

test("the JWT is RS256, has the service-account claims and verifies with the public key", () => {
  const jwt = serviceAccountJwt(config, 1_760_000_000);
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT", kid: "test-key-id" });
  assert.deepEqual(decode(claims), {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_760_000_000,
    exp: 1_760_003_600,
  });
  const verifier = createVerify("RSA-SHA256").update(`${header}.${claims}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, "base64url")), true);
  const tampered = createVerify("RSA-SHA256").update(`${header}.${claims}x`);
  assert.equal(tampered.verify(publicKey, Buffer.from(signature, "base64url")), false);
});

test("the token request is a JWT bearer grant, cached until shortly before it expires", async () => {
  const google = fakeGoogle();
  let now = 1_760_000_000_000;
  const token = serviceAccountToken(config, { fetchImpl: google.fetchImpl, now: () => now });
  const [first, concurrent] = await Promise.all([token(), token()]);
  assert.equal(first, "token-1");
  assert.equal(concurrent, "token-1");
  now += 55 * 60_000;
  assert.equal(await token(), "token-1");
  assert.equal(google.tokenCalls().length, 1);

  const { init } = google.tokenCalls()[0];
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, { "Content-Type": "application/x-www-form-urlencoded" });
  const form = new URLSearchParams(String(init.body));
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(decode(form.get("assertion")!.split(".")[1]).iat, 1_760_000_000);

  now += 5 * 60_000; // 60 minutes in: within the refresh margin
  assert.equal(await token(), "token-2");
  assert.equal(google.tokenCalls().length, 2);
});

test("a failed token request is not cached", async () => {
  let fail = true;
  const fetchImpl = (async () =>
    fail
      ? Response.json({ error: "invalid_grant" }, { status: 400 })
      : Response.json({ access_token: "ok", expires_in: 3600 })) as typeof fetch;
  const token = serviceAccountToken(config, { fetchImpl });
  await assert.rejects(token(), /token request failed \(400 invalid_grant\)/);
  fail = false;
  assert.equal(await token(), "ok");
});

test("Vertex AI gets a bearer token and a JSON-schema body with minimal thinking", async () => {
  const google = fakeGoogle();
  const gemini = vertexGemini(config, { fetchImpl: google.fetchImpl });
  await localizeText(editor, { kind: "title", items: ["  Om Jai Jagdish Hare "] }, { gemini });

  const [call] = google.generateCalls();
  assert.equal(
    call.url,
    "https://aiplatform.googleapis.com/v1/projects/bhaktara-test/locations/global/publishers/google/models/gemini-test-model:generateContent",
  );
  assert.equal(call.url, generateContentUrl("bhaktara-test", "gemini-test-model"));
  assert.equal(call.init.method, "POST");
  assert.deepEqual(call.init.headers, {
    Authorization: "Bearer token-1",
    "Content-Type": "application/json",
  });
  const body = call.body!;
  assert.deepEqual(Object.keys(body).sort(), ["contents", "generationConfig"]);
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].role, "user");
  const prompt: string = body.contents[0].parts[0].text;
  assert.match(prompt, /Devanagari/);
  assert.match(prompt, /Ram Ka Naam Liye Ja/);
  assert.ok(prompt.endsWith('["Om Jai Jagdish Hare"]'));
  const generation = body.generationConfig;
  assert.equal(generation.responseMimeType, "application/json");
  assert.equal(generation.temperature, 0.2);
  assert.deepEqual(generation.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(generation.maxOutputTokens, undefined);
  assert.equal(generation.responseSchema.type, "OBJECT");
  assert.deepEqual(generation.responseSchema.properties.items.items.required, [
    "language",
    "hi",
    "en",
  ]);
});

test("a model that rejects thinkingConfig is asked once more without it", async () => {
  let rejected = 0;
  const google = fakeGoogle(undefined, (body) => {
    if (!body.generationConfig.thinkingConfig) return undefined;
    rejected += 1;
    return Response.json(
      {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          message: "Unable to submit request because thinking_level is not supported by this model.",
        },
      },
      { status: 400 },
    );
  });
  const gemini = vertexGemini(config, { fetchImpl: google.fetchImpl });
  const result = await localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, { gemini });
  assert.equal(result.items[0].hi, "ॐ जय जगदीश हरे");
  assert.equal(rejected, 1);
  assert.deepEqual(
    google.generateCalls().map((call) => "thinkingConfig" in call.body!.generationConfig),
    [true, false],
  );
  // The same client remembers and does not offer thinking again.
  await localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, { gemini });
  assert.equal(rejected, 1);
  assert.equal(google.generateCalls().length, 3);

  // Other 400s are not retried.
  const other = fakeGoogle(undefined, () =>
    Response.json({ error: { status: "INVALID_ARGUMENT", message: "Bad schema" } }, { status: 400 }),
  );
  await assert.rejects(
    localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, {
      gemini: vertexGemini(config, { fetchImpl: other.fetchImpl }),
    }),
    (error: HttpsError) => error.code === "unavailable" && !error.message.includes("Bad schema"),
  );
  assert.equal(other.generateCalls().length, 1);
});

test("Hindi gets a Hinglish en, English or Hinglish gets a Devanagari hi, in order", async () => {
  const google = fakeGoogle((items) => ({
    // A reply that echoes nothing useful in the original side: the input wins.
    items: items.map((item) => ({ ...answers[item], [answers[item].language]: "ignored" })),
  }));
  const gemini = geminiFromEnv(env, google.fetchImpl);
  assert.ok(gemini);
  const items = ["राम का नाम लिए जा", "Om Jai Jagdish Hare", "Hanuman Chalisa fast version", "108"];
  const result = await localizeText(editor, { kind: "title", items }, { gemini });
  assert.deepEqual(result.items, [
    { language: "hi", hi: "राम का नाम लिए जा", en: "Ram Ka Naam Liye Ja" },
    { language: "en", en: "Om Jai Jagdish Hare", hi: "ॐ जय जगदीश हरे" },
    { language: "en", en: "Hanuman Chalisa fast version", hi: "हनुमान चालीसा तेज़ संस्करण" },
    // No letters: nothing to convert, nothing asked.
    { language: "en", en: "108", hi: "108" },
  ]);
  assert.deepEqual(itemsOf(google.generateCalls()[0].body as never), items.slice(0, 3));
  // The env client is reused, and so is its token.
  await localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, {
    gemini: geminiFromEnv(env, google.fetchImpl),
  });
  assert.equal(google.tokenCalls().length, 1);
});

test("the script overrides a wrong language guess", async () => {
  const gemini: Gemini = async () =>
    JSON.stringify({
      items: [
        { language: "en", hi: "राम का नाम लिए जा", en: "Ram Ka Naam Liye Ja" },
        { language: "hi", hi: "ॐ जय जगदीश हरे", en: "Om Jai Jagdish Hare" },
      ],
    });
  const result = await localizeText(
    editor,
    { kind: "title", items: ["राम का नाम लिए जा", "Om Jai Jagdish Hare"] },
    { gemini },
  );
  assert.deepEqual(
    result.items.map((item) => item.language),
    ["hi", "en"],
  );
});

test("lyrics keep every line break, blank line and [Section] header", async () => {
  const lyrics = [
    "[Chorus]",
    "जय गणेश जय गणेश देवा",
    "  माता जाकी पार्वती",
    "",
    "[Verse 1]",
    "पिता महादेवा  ",
    "जय गणेश जय गणेश देवा",
    "॥ 2 ॥",
    "",
  ].join("\r\n");
  const google = fakeGoogle();
  const gemini = vertexGemini(config, { fetchImpl: google.fetchImpl });
  const result = await localizeText(editor, { kind: "lyrics", items: [lyrics] }, { gemini });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].language, "hi");
  assert.equal(result.items[0].hi, lyrics);
  assert.equal(
    result.items[0].en,
    [
      "[Chorus]",
      "Jai Ganesh Jai Ganesh Deva",
      "  Mata Jaki Parvati",
      "",
      "[Verse 1]",
      "Pita Mahadeva  ",
      "Jai Ganesh Jai Ganesh Deva",
      "॥ 2 ॥",
      "",
    ].join("\r\n"),
  );
  const [call] = google.generateCalls();
  // Line by line, the repeated chorus line once, headers and marks not asked.
  assert.deepEqual(itemsOf(call.body as never), [
    "जय गणेश जय गणेश देवा",
    "माता जाकी पार्वती",
    "पिता महादेवा",
  ]);
  assert.match(call.body!.contents[0].parts[0].text, /never merge, split/);
  const cap = call.body!.generationConfig.maxOutputTokens;
  assert.ok(cap >= 1024 && cap <= MAX_LYRICS_OUTPUT_TOKENS, String(cap));
});

test("long lyrics are capped at 16384 output tokens, and a cut-off answer is reported", async () => {
  const line = (index: number) => `Hare Krishna Hare Rama ${index}`;
  const lyrics = Array.from({ length: 700 }, (_, index) => line(index)).join("\n");
  assert.ok(lyrics.length <= 20_000);
  const google = fakeGoogle(undefined, () =>
    Response.json({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"items": [' }] } }],
      usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 16384 },
    }),
  );
  await assert.rejects(
    localizeText(editor, { kind: "lyrics", items: [lyrics] }, {
      gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
    }),
    (error: HttpsError) => error.code === "resource-exhausted",
  );
  assert.equal(google.generateCalls()[0].body!.generationConfig.maxOutputTokens, MAX_LYRICS_OUTPUT_TOKENS);
});

test("empty, wrong-script or missing items are rejected", async () => {
  const replies: unknown[] = [
    { items: [answers["Om Jai Jagdish Hare"], { language: "hi", hi: "राम का नाम लिए जा", en: "  " }] },
    { items: [answers["Om Jai Jagdish Hare"], { language: "hi", hi: "राम का नाम लिए जा", en: "राम" }] },
    { items: [{ language: "en", hi: "Om Jai Jagdish Hare", en: "Om Jai Jagdish Hare" }, answers["राम का नाम लिए जा"]] },
    { items: [answers["Om Jai Jagdish Hare"]] },
    { nothing: true },
  ];
  for (const reply of replies) {
    const gemini: Gemini = async () => JSON.stringify(reply);
    await assert.rejects(
      localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare", "राम का नाम लिए जा"] }, { gemini }),
      (error: HttpsError) => error.code === "internal",
      JSON.stringify(reply),
    );
  }
  const notJson: Gemini = async () => "ॐ जय जगदीश हरे";
  await assert.rejects(
    localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, { gemini: notJson }),
    (error: HttpsError) => error.code === "internal",
  );
  const empty: Gemini = async () => JSON.stringify({ items: [{ language: "en", hi: "", en: "Aarti" }] });
  await assert.rejects(
    localizeText(editor, { kind: "title", items: ["Aarti"] }, { gemini: empty }),
    (error: HttpsError) => error.code === "internal" && error.message.includes('"Aarti"'),
  );
  const badLine: Gemini = async () =>
    JSON.stringify({ items: [answers["जय गणेश जय गणेश देवा"], { language: "hi", hi: "पिता महादेवा", en: "" }] });
  await assert.rejects(
    localizeText(editor, { kind: "lyrics", items: ["जय गणेश जय गणेश देवा\n\nपिता महादेवा"] }, { gemini: badLine }),
    (error: HttpsError) => error.code === "internal" && /line 3\b/.test(error.message),
  );
});

test("Google errors become 'unavailable' without leaking details", async () => {
  const google = fakeGoogle(undefined, () =>
    Response.json(
      { error: { status: "PERMISSION_DENIED", message: "secret details" } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, {
      gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
    }),
    (error: HttpsError) =>
      error.code === "unavailable" && !error.message.includes("secret details"),
  );
});

test("a missing configuration is failed-precondition", async () => {
  for (const missing of [{}, { ...env, GEMINI_SA_PRIVATE_KEY: undefined }])
    await assert.rejects(
      localizeText(editor, { kind: "title", items: ["Om Jai Jagdish Hare"] }, { env: missing }),
      (error: HttpsError) =>
        error.code === "failed-precondition" && error.message === "Gemini is not configured.",
    );
});

test("the callable checks the role, then the input", async () => {
  const never: Gemini = async () => assert.fail("Gemini must not be called");
  for (const role of ["ANALYST", "MODERATOR"] as const)
    await assert.rejects(
      localizeText({ uid: "x", role }, { kind: "title", items: ["Om"] }, { gemini: never }),
      (error: HttpsError) => error.code === "permission-denied",
    );
  for (const data of [
    {},
    { items: ["Om"] },
    { kind: "description", items: ["Om"] },
    { kind: "title", items: [] },
    { kind: "title", items: ["   "] },
    { kind: "title", items: ["x".repeat(201)] },
    { kind: "title", items: Array.from({ length: 51 }, (_, index) => `Title ${index}`) },
    { kind: "title", items: ["ok"], extra: true },
    { kind: "lyrics", items: [] },
    { kind: "lyrics", items: ["one", "two"] },
    { kind: "lyrics", items: [" \n \n"] },
    { kind: "lyrics", items: ["x".repeat(20_001)] },
  ])
    await assert.rejects(
      localizeText(editor, data, { gemini: never }),
      (error: HttpsError) => error.code === "invalid-argument",
      JSON.stringify(data).slice(0, 80),
    );
});
