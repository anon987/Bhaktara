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

export type SearchDeity = {
  name: { hi: string; en: string };
  aliases: string[];
};
// Doc 22 B1 token sources for a content item: titles, tags, deity names and
// aliases (unknown deities fall back to their ID) and category IDs. Used by the
// manifest importer and the CMS Cloud Functions so both index identically.
export function contentSearchTokens(
  content: {
    title: { hi: string; en: string };
    tags: string[];
    deityIds: string[];
    categoryIds: string[];
  },
  deities: ReadonlyMap<string, SearchDeity>,
): string[] {
  const deityTerms = content.deityIds.flatMap((id) => {
    const deity = deities.get(id);
    return deity ? [deity.name.en, deity.name.hi, ...deity.aliases] : [id];
  });
  return buildSearchTokens([
    content.title.en,
    content.title.hi,
    ...content.tags,
    ...deityTerms,
    ...content.categoryIds,
  ]);
}
