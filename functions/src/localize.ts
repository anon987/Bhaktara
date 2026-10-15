import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { Actor, parse, requirePermission } from "./core";
import { Gemini, GeminiCallError, geminiFromEnv, GeminiRequest } from "./gemini";

// localizeText (EDITOR+, doc 09 content editing): Gemini detects whether each
// text is Hindi (Devanagari) or English/Hinglish (Roman script) and writes
// the other side.
// - Hindi in: hi = the text unchanged, en = its Hinglish transliteration as
//   Indians type it ("राम का नाम लिए जा" → "Ram Ka Naam Liye Ja"), not an
//   English translation.
// - English or Hinglish in: en = the text unchanged, hi = the Devanagari
//   title a devotee would recognise ("Om Jai Jagdish Hare" → "ॐ जय जगदीश हरे").
// Lyrics are sent line by line, so line breaks, blank lines and [Section]
// headers come back exactly as they were. Long lyrics are split into chunks
// of whole stanzas, asked a few at a time and stitched back in order.

export const MAX_TITLES = 50;
export const MAX_TITLE_LENGTH = 200;
export const MAX_LYRICS_LENGTH = 20_000;

export const localizeTextSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("title"),
      items: z
        .array(z.string().trim().min(1).max(MAX_TITLE_LENGTH))
        .min(1)
        .max(MAX_TITLES),
    })
    .strict(),
  z
    .object({
      kind: z.literal("lyrics"),
      items: z
        .array(
          z
            .string()
            .max(MAX_LYRICS_LENGTH)
            .refine((text) => text.trim().length > 0, "The lyrics are empty."),
        )
        .length(1),
    })
    .strict(),
]);
export type LocalizeInput = z.infer<typeof localizeTextSchema>;

export type Language = "hi" | "en";
export type LocalizedText = { language: Language; hi: string; en: string };

const devanagari = /[ऀ-ॿ]/;
const latin = /[A-Za-z]/;
const letters = /\p{L}/u;
const sectionHeader = /^\s*\[[^\]\n]*\]\s*$/;

// The script decides when it is unambiguous; mixed text is Gemini's call.
const scriptLanguage = (text: string): Language | null =>
  !devanagari.test(text) ? "en" : !latin.test(text) ? "hi" : null;

// Vertex AI responseSchema (OpenAPI subset).
export const localizeResponseSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          language: { type: "STRING", enum: ["hi", "en"] },
          hi: { type: "STRING" },
          en: { type: "STRING" },
        },
        required: ["language", "hi", "en"],
      },
    },
  },
  required: ["items"],
};

export function localizePrompt(kind: LocalizeInput["kind"], texts: string[]) {
  const what =
    kind === "title"
      ? "Each item is the title of a devotional song, aarti, mantra, chalisa, ringtone, status video or wallpaper."
      : "Each item is one line of a devotional song's lyrics. Convert each line on its own: never merge, split, shorten or summarise lines, and keep the punctuation.";
  return [
    "You localise text for a Hindu devotional app used by Hindi speakers.",
    what,
    "For each item, decide its language:",
    '- "hi" if it is Hindi written in Devanagari. Then "hi" is the item exactly as given, and "en" is its Hinglish version: the same Hindi words in Roman script, as Indians type them, NOT an English translation. Example: "राम का नाम लिए जा" → "Ram Ka Naam Liye Ja".',
    '- "en" if it is English or Hinglish (Hindi in Roman script). Then "en" is the item exactly as given, and "hi" is the natural Hindi a devotee would recognise, in Devanagari.',
    "Rules for the Devanagari side:",
    '- Use the traditional, devotional spelling of well-known titles and prayers, e.g. "Om Jai Jagdish Hare" → "ॐ जय जगदीश हरे", "Hanuman Chalisa" → "हनुमान चालीसा", "Shiv Tandav Stotram" → "शिव तांडव स्तोत्रम्".',
    '- Transliterate proper names (deities, saints, places, mantras) and Hinglish words; translate English descriptive words, e.g. "fast version" → "तेज़ संस्करण".',
    "Rules for the Hinglish side: common Indian spellings (Shiv, Ram, Krishna, Bhole, Maiya), no diacritics, no Devanagari.",
    kind === "title"
      ? "Capitalise each word of a Hinglish title. Keep numbers. Do not add words that are not in the item."
      : "Keep the capitalisation style of the line. Keep numbers and repeat marks such as (x2).",
    "Only the text itself: no quotes, no explanations.",
    `Return JSON {"items": [{"language": "hi" | "en", "hi": <Devanagari>, "en": <Roman script>}]} with exactly ${texts.length} items, in the same order as the input.`,
    "Input items (JSON array):",
    JSON.stringify(texts),
  ].join("\n");
}

const replySchema = z.object({
  items: z.array(
    z.object({ language: z.string().optional(), hi: z.string(), en: z.string() }),
  ),
});
const unquote = (value: string) =>
  value.trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim();

type Converted = { language: Language; other: string };

// A rough token estimate of a lyrics chunk: the lines (Devanagari takes more
// tokens per character than Roman script, so characters / 2 errs high) plus
// the JSON wrapper the answer puts around each of them.
const ITEM_WRAPPER = JSON.stringify({ language: "hi", hi: "", en: "" }).length + 1;
export const lyricsTokenEstimate = (texts: string[]) =>
  Math.ceil((JSON.stringify({ items: texts }).length + ITEM_WRAPPER * texts.length) / 2);
// The answer repeats each line and adds its other side, so the cap is a
// generous six times the estimate, within limits.
export const MAX_LYRICS_OUTPUT_TOKENS = 8192;
export const lyricsOutputCap = (texts: string[]) =>
  Math.min(MAX_LYRICS_OUTPUT_TOKENS, Math.max(1024, 6 * lyricsTokenEstimate(texts)));

// Lyrics chunks: whole stanzas, up to this many lines or characters.
export const LYRICS_CHUNK_MAX_LINES = 25;
export const LYRICS_CHUNK_MAX_CHARACTERS = 600;
// Chunks asked at the same time.
export const LYRICS_CONCURRENCY = 3;
// All of a lyrics call's requests end within this, inside the callable's
// own 120 s timeout.
const LYRICS_BUDGET_MS = 110_000;

// Picks an answer for each text: by position when the counts match, else
// by the side the model echoes back unchanged (lyrics only), so the lines
// it skipped can be asked again.
type Answer = z.infer<typeof replySchema>["items"][number];
const matchAnswers = (texts: string[], items: Answer[]): (Answer | undefined)[] => {
  if (items.length === texts.length) return items;
  const unused = [...items];
  return texts.map((input) => {
    const index = unused.findIndex(
      (answer) => answer.hi.trim() === input || answer.en.trim() === input,
    );
    return index < 0 ? undefined : unused.splice(index, 1)[0];
  });
};

// Asks Gemini about `texts` (each with letters) and checks every answer: a
// Devanagari "hi" for English input, a Roman-script "en" for Hindi input.
// Returns null for the failed ones instead of throwing so callers can name
// them. A cut-off answer is "resource-exhausted".
async function convert(
  gemini: Gemini,
  kind: LocalizeInput["kind"],
  texts: string[],
  timeoutMs: number,
  logContext: Record<string, unknown>,
  extra: Pick<GeminiRequest, "maxOutputTokens" | "onUsage"> = {},
): Promise<{ converted: (Converted | null)[] }> {
  let text: string;
  try {
    text = await gemini({
      prompt: localizePrompt(kind, texts),
      responseSchema: localizeResponseSchema,
      timeoutMs,
      logContext,
      ...extra,
    });
  } catch (error) {
    // Status and Google's short reason only; never the body, key or token.
    const cutOff = error instanceof GeminiCallError && error.reason === "MAX_TOKENS";
    logger[cutOff ? "warn" : "error"]("Gemini call failed", {
      ...logContext,
      ...(error instanceof GeminiCallError
        ? { step: error.step, status: error.status, reason: error.reason }
        : { error: error instanceof Error ? error.name : "unknown" }),
    });
    if (cutOff)
      throw new HttpsError(
        "resource-exhausted",
        "Gemini's answer was cut off because the text is too long. Split it and try again.",
      );
    const timedOut = (error as { name?: unknown } | null)?.name === "TimeoutError";
    throw new HttpsError(
      timedOut ? "deadline-exceeded" : "unavailable",
      timedOut
        ? "Gemini took too long to answer. Try again."
        : "Gemini could not be reached. Try again in a minute.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const reply = replySchema.safeParse(json);
  if (!reply.success || reply.data.items.length !== texts.length) {
    logger.warn("Gemini reply rejected", {
      ...logContext,
      replyLength: text.length,
      items: reply.success ? reply.data.items.length : null,
    });
    // Titles are asked in one go; lyric lines that are missing are asked again.
    if (kind === "title")
      throw new HttpsError("internal", "Gemini sent an incomplete reply. Try again.");
  }
  const answers = matchAnswers(texts, reply.success ? reply.data.items : []);
  const clean = kind === "title" ? unquote : (value: string) => value.trim();
  return {
    converted: texts.map((input, index) => {
      const answer = answers[index];
      if (!answer) return null;
      const said = answer.language === "hi" || answer.language === "en" ? answer.language : null;
      const language = scriptLanguage(input) ?? said ?? "en";
      const other = clean(language === "hi" ? answer.en : answer.hi);
      const valid =
        language === "hi"
          ? latin.test(other) && !devanagari.test(other)
          : devanagari.test(other);
      return valid ? { language, other } : null;
    }),
  };
}

const quoted = (texts: string[]) =>
  texts
    .slice(0, 5)
    .map((text) => `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`)
    .join(", ") + (texts.length > 5 ? ` and ${texts.length - 5} more` : "");

async function localizeTitles(
  gemini: Gemini,
  titles: string[],
  logContext: Record<string, unknown>,
): Promise<LocalizedText[]> {
  // Titles without letters ("108") read the same on both sides.
  const asked = [...new Set(titles.filter((title) => letters.test(title)))];
  const { converted } = asked.length
    ? await convert(gemini, "title", asked, 50_000, logContext)
    : { converted: [] };
  const byText = new Map(asked.map((title, index) => [title, converted[index]]));
  const failed = asked.filter((_, index) => !converted[index]);
  if (failed.length) {
    logger.warn("Gemini left items unconverted", { ...logContext, failed: failed.length });
    throw new HttpsError(
      "internal",
      `Gemini could not convert ${quoted(failed)}. Try again or type ${failed.length === 1 ? "it" : "them"} in.`,
    );
  }
  return titles.map((title) => {
    const result = byText.get(title);
    if (!result) return { language: "en", hi: title, en: title };
    return result.language === "hi"
      ? { language: "hi", hi: title, en: result.other }
      : { language: "en", en: title, hi: result.other };
  });
}

// Lines keep their own whitespace; only the words between change.
const splitLine = (line: string) => {
  const match = /^(\s*)(.*?)(\s*)$/s.exec(line)!;
  return { lead: match[1], body: match[2], trail: match[3] };
};

// Packs stanzas into chunks of at most `maxLines` lines and `maxCharacters`
// characters, keeping each stanza whole when it fits in a chunk of its own;
// a longer stanza is split between lines.
export function chunkLyrics(
  stanzas: string[][],
  maxLines = LYRICS_CHUNK_MAX_LINES,
  maxCharacters = LYRICS_CHUNK_MAX_CHARACTERS,
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  const fits = (lines: number, characters: number) =>
    lines <= maxLines && characters <= maxCharacters;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    size = 0;
  };
  for (const stanza of stanzas) {
    const characters = stanza.reduce((sum, line) => sum + line.length, 0);
    if (!fits(current.length + stanza.length, size + characters)) flush();
    if (fits(stanza.length, characters)) {
      current.push(...stanza);
      size += characters;
      continue;
    }
    for (const line of stanza) {
      if (current.length && !fits(current.length + 1, size + line.length)) flush();
      current.push(line);
      size += line.length;
    }
  }
  flush();
  return chunks;
}

// Runs at most `max` tasks at a time; a finished task hands its slot
// straight to the next one waiting.
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < max) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

async function localizeLyrics(
  gemini: Gemini,
  lyrics: string,
  logContext: Record<string, unknown>,
): Promise<LocalizedText> {
  // Separators are kept as split out ("\n" or "\r\n").
  const parts = lyrics.split(/(\r?\n)/);
  const isLine = (index: number) => index % 2 === 0;
  const isContent = (part: string) => letters.test(part) && !sectionHeader.test(part);
  // Stanzas end at blank lines and [Section] headers. Repeated lines (a
  // chorus) are asked once, where they first appear.
  const seen = new Set<string>();
  const stanzas: string[][] = [[]];
  parts.forEach((part, index) => {
    if (!isLine(index)) return;
    if (!isContent(part)) {
      if (!part.trim() || sectionHeader.test(part)) stanzas.push([]);
      return;
    }
    const { body } = splitLine(part);
    if (seen.has(body)) return;
    seen.add(body);
    stanzas[stanzas.length - 1].push(body);
  });
  const chunks = chunkLyrics(stanzas.filter((stanza) => stanza.length));
  const results = new Map<string, Converted | null>();
  const totals = {
    calls: 0,
    retries: 0,
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
  };
  const deadline = Date.now() + LYRICS_BUDGET_MS;
  const slot = limiter(LYRICS_CONCURRENCY);
  // One request; the usage log line names the chunk ("2", halves "2a" and
  // "2b", the retry of missing lines "2r").
  const ask = (texts: string[], chunk: string) =>
    slot(() => {
      totals.calls += 1;
      return convert(
        gemini,
        "lyrics",
        texts,
        Math.max(1000, Math.min(50_000, deadline - Date.now())),
        { ...logContext, chunk, lines: texts.length },
        {
          maxOutputTokens: lyricsOutputCap(texts),
          onUsage: (usage) => {
            totals.promptTokenCount += usage.promptTokenCount ?? 0;
            totals.candidatesTokenCount += usage.candidatesTokenCount ?? 0;
            totals.thoughtsTokenCount += usage.thoughtsTokenCount ?? 0;
          },
        },
      );
    });
  // A cut-off answer is asked again in halves, down to single lines; a
  // single line cut off counts as failed.
  const askSplitting = async (texts: string[], chunk: string): Promise<(Converted | null)[]> => {
    try {
      return (await ask(texts, chunk)).converted;
    } catch (error) {
      if (!(error instanceof HttpsError && error.code === "resource-exhausted")) throw error;
      if (texts.length === 1) return [null];
      totals.retries += 2;
      const middle = Math.ceil(texts.length / 2);
      const halves = await Promise.all([
        askSplitting(texts.slice(0, middle), `${chunk}a`),
        askSplitting(texts.slice(middle), `${chunk}b`),
      ]);
      return halves.flat();
    }
  };
  // Lines missing or unconverted in a chunk's answer are asked once more,
  // on their own.
  const runChunk = async (texts: string[], chunk: string) => {
    const converted = await askSplitting(texts, chunk);
    const missing = texts.filter((_, index) => !converted[index]);
    let again: (Converted | null)[] = [];
    if (missing.length) {
      totals.retries += 1;
      again = await askSplitting(missing, `${chunk}r`);
    }
    texts.forEach((text, index) =>
      results.set(text, converted[index] ?? again[missing.indexOf(text)] ?? null),
    );
  };
  try {
    await Promise.all(chunks.map((texts, index) => runChunk(texts, String(index + 1))));
  } finally {
    // Counts only, one line per call.
    logger.info("Lyrics converted in chunks", {
      ...logContext,
      lines: seen.size,
      chunks: chunks.length,
      ...totals,
      failed: [...results.values()].filter((result) => !result).length,
    });
  }
  const resultOf = (part: string) => results.get(splitLine(part).body) ?? null;
  const failedLines = parts
    .map((part, index) => ({ part, line: index / 2 + 1, index }))
    .filter(({ part, index }) => isLine(index) && isContent(part) && !resultOf(part))
    .map(({ line }) => line);
  if (failedLines.length) {
    const count = failedLines.length;
    logger.warn("Gemini left lyric lines unconverted", { ...logContext, failed: count });
    throw new HttpsError(
      "internal",
      `Gemini could not convert ${count} line${count === 1 ? "" : "s"} of the lyrics (line${count === 1 ? "" : "s"} ${failedLines.slice(0, 10).join(", ")}${count > 10 ? "…" : ""}). Try again.`,
    );
  }
  // The language of the lyrics: the one most of the text is in.
  const weight = { hi: 0, en: 0 };
  results.forEach((result, body) => {
    weight[result!.language] += body.length;
  });
  const language: Language = weight.en > weight.hi ? "en" : "hi";
  const other: Language = language === "hi" ? "en" : "hi";
  const otherSide = parts
    .map((part, index) => {
      if (!isLine(index) || !isContent(part)) return part;
      const { lead, body, trail } = splitLine(part);
      const result = results.get(body)!;
      // A line already in the other language stays as it is.
      return result.language === other ? part : `${lead}${result.other}${trail}`;
    })
    .join("");
  return language === "hi"
    ? { language, hi: lyrics, en: otherSide }
    : { language, en: lyrics, hi: otherSide };
}

export async function localizeText(
  actor: Actor,
  data: unknown,
  deps: { gemini?: Gemini | null; env?: NodeJS.ProcessEnv } = {},
): Promise<{ items: LocalizedText[] }> {
  requirePermission(actor, "content.edit");
  const input = parse(localizeTextSchema, data);
  const gemini =
    deps.gemini === undefined ? geminiFromEnv(deps.env ?? process.env) : deps.gemini;
  if (!gemini)
    throw new HttpsError("failed-precondition", "Gemini is not configured.");
  // Counts only: the texts and the replies stay out of the logs.
  const logContext = {
    uid: actor.uid,
    kind: input.kind,
    count: input.items.length,
    characters: input.items.reduce((sum, item) => sum + item.length, 0),
  };
  const items =
    input.kind === "title"
      ? await localizeTitles(gemini, input.items, logContext)
      : [await localizeLyrics(gemini, input.items[0], logContext)];
  logger.info("Text localised", {
    ...logContext,
    hindi: items.filter((item) => item.language === "hi").length,
  });
  return { items };
}
