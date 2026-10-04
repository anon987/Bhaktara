// Shared normalization for the trusted seed/publish pipeline and query input.
export function searchWords(input: string): string[] {
  return [
    ...new Set(
      input
        .normalize("NFD")
        .replace(/\u093c/g, "")
        .replace(/\u0901/g, "\u0902")
        .normalize("NFC")
        .toLowerCase()
        .replace(/aa/g, "a")
        .replace(/ee/g, "i")
        .replace(/oo/g, "u")
        .replace(/sh/g, "s")
        .replace(/w/g, "v")
        .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean),
    ),
  ];
}
export function buildSearchTokens(sources: string[]): string[] {
  const tokens = new Set<string>();
  for (const word of searchWords(sources.join(" "))) {
    tokens.add(word);
    const letters = Array.from(word);
    for (let length = 2; length <= Math.min(letters.length, 10); length++) {
      tokens.add(letters.slice(0, length).join(""));
    }
  }
  return [...tokens].slice(0, 200);
}
