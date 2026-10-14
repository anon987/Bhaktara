import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { Actor, parse, requirePermission } from "./core";
import { Gemini, GeminiCallError, geminiFromEnv } from "./gemini";

// localizeText (EDITOR+, doc 09 content editing): Gemini detects whether each
// text is Hindi (Devanagari) or English/Hinglish (Roman script) and writes
// the other side.
// - Hindi in: hi = the text unchanged, en = its Hinglish transliteration as
//   Indians type it ("राम का नाम लिए जा" → "Ram Ka Naam Liye Ja"), not an
//   English translation.
// - English or Hinglish in: en = the text unchanged, hi = the Devanagari
//   title a devotee would recognise ("Om Jai Jagdish Hare" → "ॐ जय जगदीश हरे").
// Lyrics are sent line by line, so line breaks, blank lines and [Section]
// headers come back exactly as they were.

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

// A rough token estimate (Devanagari takes more tokens per character than
// Roman script, so characters / 2 errs high), times three, within limits.
export const MAX_LYRICS_OUTPUT_TOKENS = 16_384;
export const lyricsOutputCap = (texts: string[]) =>
  Math.min(
    MAX_LYRICS_OUTPUT_TOKENS,
    Math.max(1024, 3 * Math.ceil(JSON.stringify(texts).length / 2)),
  );

// Asks Gemini about `texts` (each with letters) and checks every answer: a
// Devanagari "hi" for English input, a Roman-script "en" for Hindi input.
// Returns the failed indexes instead of throwing so callers can name them.
async function convert(
  gemini: Gemini,
  kind: LocalizeInput["kind"],
  texts: string[],
  timeoutMs: number,
  logContext: Record<string, unknown>,
): Promise<{ converted: (Converted | null)[] }> {
  let text: string;
  try {
    text = await gemini({
      prompt: localizePrompt(kind, texts),
      responseSchema: localizeResponseSchema,
      timeoutMs,
      // Lyrics can be long: cap the billed output at about three times
      // the input, so a runaway answer stays cheap.
      maxOutputTokens: kind === "lyrics" ? lyricsOutputCap(texts) : undefined,
      logContext,
    });
  } catch (error) {
    // Status and Google's short reason only; never the body, key or token.
    logger.error("Gemini call failed", {
      ...logContext,
      ...(error instanceof GeminiCallError
        ? { step: error.step, status: error.status, reason: error.reason }
        : { error: error instanceof Error ? error.name : "unknown" }),
    });
    if (error instanceof GeminiCallError && error.reason === "MAX_TOKENS")
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
    logger.warn("Gemini reply rejected", { ...logContext, replyLength: text.length });
    throw new HttpsError(
      "internal",
      "Gemini sent an incomplete reply. Try again.",
    );
  }
  const clean = kind === "title" ? unquote : (value: string) => value.trim();
  return {
    converted: texts.map((input, index) => {
      const answer = reply.data.items[index];
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

async function localizeLyrics(
  gemini: Gemini,
  lyrics: string,
  logContext: Record<string, unknown>,
): Promise<LocalizedText> {
  // Separators are kept as split out ("\n" or "\r\n").
  const parts = lyrics.split(/(\r?\n)/);
  const isLine = (index: number) => index % 2 === 0;
  const isContent = (part: string) => letters.test(part) && !sectionHeader.test(part);
  // Repeated lines (a chorus) are asked once.
  const asked = [
    ...new Set(
      parts
        .filter((part, index) => isLine(index) && isContent(part))
        .map((part) => splitLine(part).body),
    ),
  ];
  const { converted } = asked.length
    ? await convert(gemini, "lyrics", asked, 110_000, logContext)
    : { converted: [] };
  const failedLines = parts
    .map((part, index) => ({ part, line: index / 2 + 1, index }))
    .filter(({ part, index }) => isLine(index) && isContent(part))
    .filter(({ part }) => !converted[asked.indexOf(splitLine(part).body)])
    .map(({ line }) => line);
  if (failedLines.length) {
    logger.warn("Gemini left lyric lines unconverted", {
      ...logContext,
      failed: failedLines.length,
    });
    throw new HttpsError(
      "internal",
      `Gemini could not convert line${failedLines.length === 1 ? "" : "s"} ${failedLines.slice(0, 10).join(", ")}${failedLines.length > 10 ? "…" : ""} of the lyrics. Try again.`,
    );
  }
  // The language of the lyrics: the one most of the text is in.
  const weight = { hi: 0, en: 0 };
  asked.forEach((body, index) => {
    weight[converted[index]!.language] += body.length;
  });
  const language: Language = weight.en > weight.hi ? "en" : "hi";
  const other: Language = language === "hi" ? "en" : "hi";
  const otherSide = parts
    .map((part, index) => {
      if (!isLine(index) || !isContent(part)) return part;
      const { lead, body, trail } = splitLine(part);
      const result = converted[asked.indexOf(body)]!;
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
