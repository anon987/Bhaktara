import type { Localized, LocalizedText } from "../api";
import { readableError } from "../errors";

// Shared by the uploader and the content editor for the localizeText
// callable (functions/src/localize.ts): which side to send, where Gemini's
// answer goes, and what to say when it fails.

export type Side = "hi" | "en";
const otherSide = (side: Side): Side => (side === "hi" ? "en" : "hi");

// The side to send: the one with text, when the other is empty.
export function sourceSide(title: Localized): Side | null {
  const hi = title.hi.trim();
  const en = title.en.trim();
  return hi && !en ? "hi" : en && !hi ? "en" : null;
}

// The side lyrics belong on: Hindi when most of their letters are
// Devanagari ("[Chorus]" style section notes in English do not count).
export function lyricsSide(text: string): Side {
  const body = text.replace(/^\s*\[[^\]]*\]\s*$/gm, "");
  const devanagari = body.match(/[ऀ-ॿ]/g)?.length ?? 0;
  const latin = body.match(/[A-Za-z]/g)?.length ?? 0;
  return devanagari > latin ? "hi" : "en";
}

// Gemini's answer for `sent` (the text of `source`) placed into `title`, or
// null when nothing may change: the source text changed meanwhile, the
// empty side was filled meanwhile, or the text belongs on the other side but
// sits in a side the editor typed into (`locked`).
// - Detected as the source's language: the empty side is filled.
// - Detected as the other language (a Hindi file name read as English, or
//   Hindi typed into the English box): the text moves to its own side and
//   the source side gets the conversion.
export function placeLocalized(
  title: Localized,
  source: Side,
  sent: string,
  result: LocalizedText,
  locked: Partial<Record<Side, boolean>> = {},
): Localized | null {
  const other = otherSide(source);
  if (title[source].trim() !== sent || title[other].trim()) return null;
  if (result.language === source) {
    const value = result[other].trim();
    return value ? { ...title, [other]: value } : null;
  }
  if (locked[source]) return null;
  const moved = { hi: result.hi.trim(), en: result.en.trim() };
  return moved.hi && moved.en ? moved : null;
}

// One line for a failed localizeText call. The generic readableError texts
// talk about R2 and the emulator, which would mislead here, so Gemini's own
// cases come first.
export function localizeError(error: unknown): string {
  const value = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    message?: unknown;
  };
  const code = String(value.code ?? "").replace(/^functions\//, "");
  const message = typeof value.message === "string" ? value.message : "";
  if (code === "failed-precondition")
    return "Gemini is not configured on this server yet. Ask the owner to set the GEMINI_* secrets for the functions.";
  if (code === "deadline-exceeded")
    return "Gemini took too long to answer. Try again.";
  if (
    (code === "internal" || code === "unavailable" || code === "resource-exhausted") &&
    /gemini/i.test(message)
  )
    return message;
  return readableError(error).message;
}
