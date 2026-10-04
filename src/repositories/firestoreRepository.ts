import type { Firestore, QueryConstraint } from "firebase/firestore";
import { z } from "zod";
import { ContentRepository } from "./contracts";
import { searchWords } from "../domain/search";
import {
  bannerDocumentSchema,
  deityDocumentSchema,
  publishedContentSchema,
} from "./firestoreSchemas";
import { SessionService } from "../services/auth/session";
import { contentSchema } from "../domain/models";
import { FirestoreApi } from "./firestoreApi";

const cursorSchema = z.object({
  score: z.number().finite(),
  id: z.string().min(1),
  fingerprint: z.string(),
});
export function createFirestoreRepository(
  db: Firestore,
  session: SessionService,
  api: FirestoreApi,
): ContentRepository {
  const {
    collection,
    doc,
    documentId,
    getDocFromServer,
    getDocsFromServer,
    limit,
    orderBy,
    query,
    startAfter,
    where,
  } = api;
  const repository: ContentRepository = {
    async getById(id) {
      if (!id || id.includes("/")) throw new Error("Invalid content ID");
      await session.ensureSession();
      const result = await getDocFromServer(doc(db, "content", id));
      return result.exists()
        ? contentSchema.parse(
            publishedContentSchema.parse({ ...result.data(), id: result.id }),
          )
        : null;
    },
    async search(input) {
      await session.ensureSession();
      const pageSize = z
        .number()
        .int()
        .min(1)
        .max(30)
        .parse(input.limit ?? 8);
      // Published prefix tokens start at two letters, so a lone first
      // keystroke would match nothing; treat it as not yet narrowing.
      const words = searchWords(input.query ?? "")
        .filter((word) => Array.from(word).length >= 2)
        .sort((a, b) => b.length - a.length || a.localeCompare(b));
      const fingerprint = JSON.stringify([
        words,
        input.type ?? null,
        input.deityId ?? null,
      ]);
      const constraints: QueryConstraint[] = [
        where("status", "==", "PUBLISHED"),
      ];
      if (input.type) constraints.push(where("type", "==", input.type));
      // Firestore allows only one array-contains per query. With text search,
      // deity matching is applied to this bounded page, not a second array clause.
      if (words.length)
        constraints.push(where("searchTokens", "array-contains", words[0]));
      else if (input.deityId)
        constraints.push(where("deityIds", "array-contains", input.deityId));
      constraints.push(
        orderBy("popularityScore", "desc"),
        orderBy(documentId(), "asc"),
      );
      if (input.cursor) {
        const cursor = cursorSchema.parse(JSON.parse(input.cursor));
        if (cursor.fingerprint !== fingerprint)
          throw new Error("Search cursor does not match filters");
        constraints.push(startAfter(cursor.score, cursor.id));
      }
      constraints.push(limit(pageSize));
      const result = await getDocsFromServer(
        query(collection(db, "content"), ...constraints),
      );
      const documents = result.docs.map((value) =>
        publishedContentSchema.parse({ ...value.data(), id: value.id }),
      );
      const items = documents
        .filter(
          (value) =>
            words.every((word) => value.searchTokens.includes(word)) &&
            (!input.deityId || value.deityIds.includes(input.deityId)),
        )
        .map((value) => contentSchema.parse(value));
      const last = documents.at(-1);
      return {
        items,
        nextCursor:
          result.size === pageSize && last
            ? JSON.stringify({
                score: last.popularityScore,
                id: last.id,
                fingerprint,
              })
            : undefined,
      };
    },
    async getCatalog() {
      await session.ensureSession();
      const [page, deities, banners] = await Promise.all([
        repository.search({ limit: 12 }),
        getDocsFromServer(
          query(
            collection(db, "deities"),
            where("isActive", "==", true),
            orderBy("sortOrder"),
            limit(30),
          ),
        ),
        getDocsFromServer(
          query(
            collection(db, "banners"),
            where("isActive", "==", true),
            orderBy("priority", "desc"),
            limit(10),
          ),
        ),
      ]);
      return {
        content: page.items,
        deities: deities.docs.map((item) => {
          const value = deityDocumentSchema.parse(item.data());
          return {
            id: item.id,
            name: value.name,
            artKey: value.mandirArt.mobile.key,
          };
        }),
        banners: banners.docs
          .map((item) => ({
            id: item.id,
            ...bannerDocumentSchema.parse(item.data()),
          }))
          .filter(
            (value) =>
              Number(value.startAt.toMillis()) <= Date.now() &&
              Number(value.endAt.toMillis()) > Date.now(),
          )
          .map((value) => ({
            id: value.id,
            title: value.title,
            subtitle: value.subtitle,
            cta: value.ctaText,
            artKey: value.image.mobile.key,
            target: value.target,
          })),
        challenges: [],
        sampleStats: { totalXp: 0, level: 1, currentStreak: 0 },
      };
    },
  };
  return repository;
}
