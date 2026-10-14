import { contentSchema } from "../domain/models";
import { ContentQuery, ContentRepository } from "./contracts";
import {
  fixtures,
  homeCollections,
  homeLayouts,
  mandirOfferingDocuments,
} from "./fixtures";
import { buildHomeFeedSections, parseHomeSections } from "../domain/home";
import { DecorItem, decorFromDocument } from "../domain/mandirDecor";
import { searchWords } from "../domain/search";
// Same normalization as the Firestore publisher/query path, so fixture and
// emulator modes agree on punctuation, nukta and transliteration variants.
export function filterContent(query: ContentQuery) {
  const words = searchWords(query.query ?? "");
  return fixtures.content.filter((item) => {
    const haystack = searchWords(item.searchTokens.join(" ")).join(" ");
    return (
      (!query.type || item.type === query.type) &&
      (!query.deityId || item.deityIds.includes(query.deityId)) &&
      words.every((word) => haystack.includes(word))
    );
  });
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
  async getHome(language) {
    return {
      language,
      banners: fixtures.banners,
      sections: parseHomeSections(
        buildHomeFeedSections(
          homeLayouts[language],
          fixtures.content,
          homeCollections,
        ),
      ),
    };
  },
  async getMandirDecor() {
    // Same lenient read as Firestore (inactive or invalid documents skipped).
    return mandirOfferingDocuments.flatMap(({ id, data }): DecorItem[] => {
      const value = decorFromDocument(id, data);
      return value ? [value] : [];
    });
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
