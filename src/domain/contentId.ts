import { ContentType } from "./models";

// Server-generated content IDs (operators never type IDs). Pure, so the
// Cloud Functions and the tests share it: slug(title) + "-" + 4 random chars.

// prettier-ignore
const consonants: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", ळ: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h",
};
// prettier-ignore
const vowels: Record<string, string> = {
  अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "ri",
  ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o",
};
// prettier-ignore
const matras: Record<string, string> = {
  "\u093e": "a", "\u093f": "i", "\u0940": "i", "\u0941": "u", "\u0942": "u",
  "\u0943": "ri", "\u0947": "e", "\u0948": "ai", "\u094b": "o", "\u094c": "au",
  "\u0945": "e", "\u0949": "o",
};
const signs: Record<string, string> = {
  "\u0902": "n",
  "\u0901": "n",
  "\u0903": "h",
  ॐ: "om",
  "।": " ",
  "॥": " ",
};
const virama = "\u094d";
// Letters and signs, excluding the dandas (U+0964, U+0965) that end words.
const isDevanagari = (value: string | undefined) =>
  value !== undefined && /[\u0900-\u0963\u0966-\u097f]/.test(value);

// Simple Hindi → Latin romanization for readable IDs (not for display).
// The inherent "a" is dropped before a matra or virama and at word end.
export function transliterateHindi(input: string): string {
  const chars = Array.from(input.normalize("NFD").replace(/\u093c/g, ""));
  let out = "";
  chars.forEach((char, index) => {
    const next = chars[index + 1];
    if (consonants[char] !== undefined) {
      out += consonants[char];
      if (next === virama || (next !== undefined && next in matras)) return;
      const endsWord = !isDevanagari(next);
      const startsWord = !isDevanagari(chars[index - 1]);
      // Keep the vowel inside words, before ं/ँ/ः, and in one-letter words.
      if (!endsWord || startsWord) out += "a";
    } else if (vowels[char] !== undefined) out += vowels[char];
    else if (matras[char] !== undefined) out += matras[char];
    else if (signs[char] !== undefined) out += signs[char];
    else if (char === virama) return;
    else if (char >= "०" && char <= "९")
      out += String(char.charCodeAt(0) - "०".charCodeAt(0));
    else out += char;
  });
  return out;
}

const MAX_BASE = 60;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/, "");
}

// Readable part of a generated ID: English title, else the romanized Hindi
// title, else the content type.
export function contentIdBase(input: {
  type: ContentType;
  title: { hi: string; en: string };
}): string {
  return (
    slugify(input.title.en ?? "") ||
    slugify(transliterateHindi(input.title.hi ?? "")) ||
    input.type.toLowerCase()
  );
}

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

// `random` returns a float in [0, 1); the server passes a crypto source.
export function generateContentId(
  input: { type: ContentType; title: { hi: string; en: string } },
  random: () => number = Math.random,
): string {
  let suffix = "";
  for (let index = 0; index < 4; index++)
    suffix +=
      alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return `${contentIdBase(input)}-${suffix}`;
}
