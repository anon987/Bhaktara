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
import {
  chunkLyrics,
  localizeText,
  LYRICS_CHUNK_MAX_CHARACTERS,
  LYRICS_CHUNK_MAX_LINES,
  LYRICS_CONCURRENCY,
  lyricsOutputCap,
  lyricsTokenEstimate,
  MAX_LYRICS_OUTPUT_TOKENS,
} from "../../src/localize";

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

// A generated bhajan of about 1,650 characters: a [Chorus] of two lines
// sung after every verse, six [Verse n] stanzas of five unique lines, blank
// lines between stanzas. Every Hindi line has a known Hinglish answer.
const words: [string, string][] = [
  ["राम", "Ram"],
  ["श्याम", "Shyam"],
  ["गोविंद", "Govind"],
  ["हरि", "Hari"],
  ["कृष्ण", "Krishna"],
  ["शिव", "Shiv"],
  ["गणेश", "Ganesh"],
  ["माता", "Mata"],
];
const hinglish = new Map<string, string>();
const hindiLine = (index: number) => {
  const [first, second] = [words[index % 8], words[Math.floor(index / 8) % 8]];
  const hi = `जय ${first[0]} ${second[0]} भजो मन सदा प्रेम से गा`;
  hinglish.set(hi, `Jai ${first[1]} ${second[1]} Bhajo Man Sada Prem Se Ga`);
  return hi;
};
const chorus = [hindiLine(60), hindiLine(61)];
const bhajan = (verses = 6, linesPerVerse = 5) => {
  const lines = ["[Chorus]", ...chorus, ""];
  for (let verse = 0; verse < verses; verse += 1)
    lines.push(
      `[Verse ${verse + 1}]`,
      ...Array.from({ length: linesPerVerse }, (_, line) => hindiLine(verse * linesPerVerse + line)),
      "",
      ...chorus,
      "",
    );
  return lines.join("\n");
};
const toHinglish = (lyrics: string) =>
  lyrics
    .split("\n")
    .map((line) => hinglish.get(line) ?? line)
    .join("\n");
const lyricAnswer = (item: string) =>
  answers[item] ?? { language: "hi", hi: item, en: hinglish.get(item) ?? "" };
// A Vertex answer for these items, or a cut-off one.
const generated = (items: unknown[], finishReason = "STOP") =>
  Response.json({
    candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify({ items }) }] } }],
    usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 700 },
  });

test("long lyrics are split into stanza chunks, each line asked once, and stitched in order", async () => {
  const lyrics = bhajan();
  assert.ok(lyrics.length >= 1550 && lyrics.length <= 1750, String(lyrics.length));
  assert.ok(lyrics.split("\n").length >= 40);
  const google = fakeGoogle((items) => ({ items: items.map(lyricAnswer) }));
  const result = await localizeText(editor, { kind: "lyrics", items: [lyrics] }, {
    gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
  });
  assert.deepEqual(result.items, [{ language: "hi", hi: lyrics, en: toHinglish(lyrics) }]);

  const asked = google.generateCalls().map((call) => itemsOf(call.body as never));
  assert.ok(asked.length >= 2, `${asked.length} chunks`);
  for (const chunk of asked) {
    assert.ok(chunk.length <= LYRICS_CHUNK_MAX_LINES);
    assert.ok(chunk.join("").length <= LYRICS_CHUNK_MAX_CHARACTERS);
  }
  // Every unique line once, in order; the chorus only the first time.
  const unique = [...new Set(lyrics.split("\n").filter((line) => hinglish.has(line)))];
  assert.deepEqual(asked.flat(), unique);
  for (const line of chorus) assert.equal(asked.flat().filter((item) => item === line).length, 1);
  // Chunks hold whole stanzas: each starts where a stanza starts.
  const stanzaStarts = lyrics.split("\n").filter((line, index, all) => {
    const before = all[index - 1];
    return hinglish.has(line) && (before === undefined || before === "" || before.startsWith("["));
  });
  for (const chunk of asked) assert.ok(stanzaStarts.includes(chunk[0]), chunk[0]);
});

test("chunking keeps stanzas whole and splits an overlong stanza between lines", () => {
  const stanza = (count: number, prefix: string) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`);
  assert.deepEqual(chunkLyrics([stanza(3, "a"), stanza(3, "b"), stanza(3, "c")], 7, 600), [
    [...stanza(3, "a"), ...stanza(3, "b")],
    stanza(3, "c"),
  ]);
  const long = stanza(30, "x");
  const chunks = chunkLyrics([stanza(2, "a"), long], 25, 600);
  assert.deepEqual(chunks[0], stanza(2, "a"));
  assert.deepEqual(chunks.slice(1).flat(), long);
  assert.ok(chunks.every((chunk) => chunk.length <= 25));
  // Characters count too.
  const wide = ["x".repeat(400), "y".repeat(400)];
  assert.deepEqual(chunkLyrics([wide], 25, 600), [[wide[0]], [wide[1]]]);
});

test("maxOutputTokens is max(1024, 6 × the chunk estimate with its JSON wrapper), at most 8192", async () => {
  assert.equal(MAX_LYRICS_OUTPUT_TOKENS, 8192);
  const short = ["राम"];
  // The wrapper counts: more than the bare lines' characters / 2.
  assert.ok(lyricsTokenEstimate(short) > Math.ceil(JSON.stringify(short).length / 2) + 10);
  assert.equal(lyricsOutputCap(short), 1024);
  const chunk = Array.from({ length: 20 }, (_, index) => hindiLine(index));
  assert.equal(lyricsOutputCap(chunk), 6 * lyricsTokenEstimate(chunk));
  assert.ok(lyricsOutputCap(chunk) > 1024);
  assert.equal(lyricsOutputCap(["x".repeat(4000)]), 8192);

  const google = fakeGoogle((items) => ({ items: items.map(lyricAnswer) }));
  await localizeText(editor, { kind: "lyrics", items: [bhajan()] }, {
    gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
  });
  for (const call of google.generateCalls())
    assert.equal(
      call.body!.generationConfig.maxOutputTokens,
      Math.min(8192, Math.max(1024, 6 * lyricsTokenEstimate(itemsOf(call.body as never)))),
    );
});

test("a cut-off chunk is asked again in halves and the result is complete", async () => {
  const lyrics = bhajan();
  // Anything over 6 lines is cut off.
  const google = fakeGoogle(undefined, (body) => {
    const items = itemsOf(body as never);
    return items.length > 6 ? generated([], "MAX_TOKENS") : generated(items.map(lyricAnswer));
  });
  const result = await localizeText(editor, { kind: "lyrics", items: [lyrics] }, {
    gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
  });
  assert.equal(result.items[0].en, toHinglish(lyrics));
  const sizes = google.generateCalls().map((call) => itemsOf(call.body as never).length);
  assert.ok(sizes.some((size) => size > 6));
  assert.ok(sizes.filter((size) => size <= 6).reduce((sum, size) => sum + size, 0) === 32, String(sizes));
});

test("lines missing from a chunk's answer are asked again on their own", async () => {
  const lyrics = bhajan();
  const dropped = [hindiLine(1), hindiLine(3)];
  let first = true;
  const google = fakeGoogle(undefined, (body) => {
    const items = itemsOf(body as never);
    if (first && items.includes(dropped[0])) {
      first = false;
      return generated(items.filter((item) => !dropped.includes(item)).map(lyricAnswer));
    }
    return generated(items.map(lyricAnswer));
  });
  const result = await localizeText(editor, { kind: "lyrics", items: [lyrics] }, {
    gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
  });
  assert.equal(result.items[0].en, toHinglish(lyrics));
  const asked = google.generateCalls().map((call) => itemsOf(call.body as never));
  assert.deepEqual(asked.at(-1), dropped);
  assert.equal(asked.flat().filter((item) => item === hindiLine(0)).length, 1);
});

test("lines that keep failing return the error, naming how many", async () => {
  const lyrics = bhajan();
  const bad = hindiLine(7);
  const google = fakeGoogle((items) => ({
    items: items.map((item) => (item === bad ? { language: "hi", hi: item, en: item } : lyricAnswer(item))),
  }));
  await assert.rejects(
    localizeText(editor, { kind: "lyrics", items: [lyrics] }, {
      gemini: vertexGemini(config, { fetchImpl: google.fetchImpl }),
    }),
    (error: HttpsError) =>
      error.code === "internal" &&
      error.message.includes("1 line of the lyrics") &&
      new RegExp(`line ${lyrics.split("\n").indexOf(bad) + 1}\\b`).test(error.message),
  );
  // Asked in its chunk, then once more on its own.
  const asked = google.generateCalls().map((call) => itemsOf(call.body as never));
  assert.equal(asked.flat().filter((item) => item === bad).length, 2);
  assert.deepEqual(asked.at(-1), [bad]);

  // Always cut off: halves down to single lines, one retry, then the error.
  const cut = fakeGoogle(undefined, () => generated([], "MAX_TOKENS"));
  await assert.rejects(
    localizeText(editor, { kind: "lyrics", items: ["जय गणेश जय गणेश देवा\nमाता जाकी पार्वती\nपिता महादेवा"] }, {
      gemini: vertexGemini(config, { fetchImpl: cut.fetchImpl }),
    }),
    (error: HttpsError) => error.code === "internal" && error.message.includes("3 lines"),
  );
  // [3] → [2] [1] → [1] [1]; retry [3] → [2] [1] → [1] [1].
  assert.equal(cut.generateCalls().length, 10);
});

test("no more than the concurrency limit of chunks are asked at once", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const gemini: Gemini = async ({ prompt }) => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    const items: string[] = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
    return JSON.stringify({ items: items.map(lyricAnswer) });
  };
  const lyrics = bhajan(10, 6);
  const result = await localizeText(editor, { kind: "lyrics", items: [lyrics] }, { gemini });
  assert.equal(result.items[0].en, toHinglish(lyrics));
  assert.ok(calls > LYRICS_CONCURRENCY, String(calls));
  assert.equal(peak, LYRICS_CONCURRENCY);
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
