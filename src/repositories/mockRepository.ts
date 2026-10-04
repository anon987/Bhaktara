import { contentSchema } from "../domain/models";
import { ContentQuery, ContentRepository } from "./contracts";
import { fixtures } from "./fixtures";
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFC")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .trim();
}
export function filterContent(query: ContentQuery) {
  const words = normalizeSearch(query.query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return fixtures.content.filter(
    (item) =>
      (!query.type || item.type === query.type) &&
      (!query.deityId || item.deityIds.includes(query.deityId)) &&
      words.every((word) =>
        normalizeSearch(item.searchTokens.join(" ")).includes(word),
      ),
  );
}
// Deliberate fixture-only search. Production must use server-generated Firestore searchTokens.
export const mockContentRepository: ContentRepository = {
  async getById(id) {
    return fixtures.content.find((item) => item.id === id) ?? null;
  },
  async getCatalog() {
    fixtures.content.forEach((item) => contentSchema.parse(item));
    return fixtures;
  },
  async search(query) {
    const items = filterContent(query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 8, 30);
    return {
      items: items.slice(offset, offset + limit),
      nextOffset: offset + limit < items.length ? offset + limit : undefined,
    };
  },
};
