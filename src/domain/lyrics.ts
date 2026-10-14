// Song lyrics (bhajan, aarti): stored as Hindi (Devanagari, as in the audio
// file's tags) and Hinglish (Roman-script transliteration). Shared by the app
// player and the admin editor so both show the same cleaned text.
export type Lyrics = { hi: string; en: string };
export type LyricsLanguage = keyof Lyrics;

export const LYRICS_MAX_LENGTH = 20000;

// A whole line that is a bracketed section or performance note, e.g.
// "[Intro — Female Lead]", "[Chorus – Mukhda]" or "[Verse 1 - Antara]".
const sectionNote = /^\[[^\]]*\]$/;

// Lyrics as stanzas of trimmed lines: bracketed notes are dropped (each one
// also ends the stanza before it), blank lines split stanzas and empty
// stanzas are left out.
export function cleanLyricsForDisplay(text: string): string[][] {
  const stanzas: string[][] = [];
  let current: string[] = [];
  const close = () => {
    if (current.length) stanzas.push(current);
    current = [];
  };
  for (const raw of text.split(/\r\n|\r|\n|\u2028|\u2029/)) {
    const line = raw.trim();
    if (!line || sectionNote.test(line)) close();
    else current.push(line);
  }
  close();
  return stanzas;
}

// The lyrics to show for the app language, falling back to the other
// language when the chosen one is empty. Null when there are none to show.
export function lyricsForLanguage(
  lyrics: Partial<Lyrics> | undefined,
  language: LyricsLanguage,
): { language: LyricsLanguage; stanzas: string[][] } | null {
  const other: LyricsLanguage = language === "hi" ? "en" : "hi";
  for (const candidate of [language, other]) {
    const stanzas = cleanLyricsForDisplay(lyrics?.[candidate] ?? "");
    if (stanzas.length) return { language: candidate, stanzas };
  }
  return null;
}
