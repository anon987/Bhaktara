import type { Firestore, QueryConstraint } from "firebase/firestore";
import { z } from "zod";
import { contentTypes, ContentType } from "../domain/models";
import { SessionService } from "../services/auth/session";
import { FavoriteRecord, FavoritesRepository } from "./contracts";
import { FirestoreApi } from "./firestoreApi";
import { codedError, firestoreErrorCode } from "./firestoreErrors";

// Firestore document IDs: no slashes, not "." / "..", not reserved __x__.
export const favoriteIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !value.includes("/") &&
      value !== "." &&
      value !== ".." &&
      !/^__.*__$/.test(value),
    "Invalid content ID",
  );
const timestampSchema = z.custom<{
  seconds: number;
  nanoseconds: number;
  toMillis(): number;
}>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    "nanoseconds" in value &&
    "toMillis" in value &&
    typeof value.seconds === "number" &&
    typeof value.nanoseconds === "number" &&
    typeof value.toMillis === "function",
);
const favoriteDocumentSchema = z.object({
  contentId: z.string().min(1),
  type: z.enum(contentTypes),
  createdAt: timestampSchema,
});
const cursorSchema = z.object({
  s: z.number().int(),
  n: z.number().int().min(0),
  id: favoriteIdSchema,
});

// users/{uid}/favorites/{contentId} for the current session (doc 06). The
// rules allow create (published content, matching type, server time), owner
// reads and delete; there is no update, so an existing favorite is detected by
// reading it back rather than overwritten.
export function createFirestoreFavoritesRepository(
  db: Firestore,
  session: SessionService,
  api: FirestoreApi,
): FavoritesRepository {
  const {
    collection,
    deleteDoc,
    doc,
    documentId,
    getDocFromServer,
    getDocsFromServer,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    startAfter,
    Timestamp,
  } = api;
  async function uid() {
    const current = await session.ensureSession();
    if (!current) throw codedError("unauthenticated", "No backend session");
    return current.uid;
  }
  async function publishedType(contentId: string): Promise<ContentType> {
    // Rules deny drafts and missing content, so this rejects for both.
    const result = await getDocFromServer(doc(db, "content", contentId));
    const parsed = z
      .object({ status: z.literal("PUBLISHED"), type: z.enum(contentTypes) })
      .safeParse(result.exists() ? result.data() : null);
    if (!parsed.success)
      throw codedError("not-found", "Content is not published");
    return parsed.data.type;
  }
  async function create(owner: string, contentId: string, type: ContentType) {
    await setDoc(doc(db, "users", owner, "favorites", contentId), {
      contentId,
      type,
      createdAt: serverTimestamp(),
    });
  }
  return {
    kind: "account",
    async add(contentId, typeHint) {
      favoriteIdSchema.parse(contentId);
      const owner = await uid();
      const type = typeHint ?? (await publishedType(contentId));
      try {
        await create(owner, contentId, type);
      } catch (error) {
        if (firestoreErrorCode(error) !== "permission-denied") throw error;
        // Create-only rules reject a repeat write of an existing favorite
        // (for example a retry whose first attempt reached the server).
        const existing = await getDocFromServer(
          doc(db, "users", owner, "favorites", contentId),
        );
        if (existing.exists()) return;
        // A stale cached type is retried once with the published one;
        // drafts and unknown IDs reject here.
        const current = await publishedType(contentId);
        if (current === type) throw error;
        await create(owner, contentId, current);
      }
    },
    async remove(contentId) {
      favoriteIdSchema.parse(contentId);
      await deleteDoc(doc(db, "users", await uid(), "favorites", contentId));
    },
    async list(input = {}) {
      const pageSize = z
        .number()
        .int()
        .min(1)
        .max(50)
        .parse(input.limit ?? 20);
      const constraints: QueryConstraint[] = [
        orderBy("createdAt", "desc"),
        orderBy(documentId(), "desc"),
      ];
      if (input.cursor) {
        const cursor = cursorSchema.parse(JSON.parse(input.cursor));
        constraints.push(
          startAfter(new Timestamp(cursor.s, cursor.n), cursor.id),
        );
      }
      const result = await getDocsFromServer(
        query(
          collection(db, "users", await uid(), "favorites"),
          ...constraints,
          limit(pageSize),
        ),
      );
      const items: FavoriteRecord[] = [];
      for (const snapshot of result.docs) {
        const parsed = favoriteDocumentSchema.safeParse(snapshot.data());
        // Rules make contentId equal the doc ID; skip anything else.
        if (parsed.success && parsed.data.contentId === snapshot.id)
          items.push({
            contentId: snapshot.id,
            type: parsed.data.type,
            createdAtMs: parsed.data.createdAt.toMillis(),
          });
      }
      const last = result.docs.at(-1);
      const lastTime = last && timestampSchema.safeParse(last.data().createdAt);
      return {
        items,
        nextCursor:
          result.size === pageSize && last && lastTime?.success
            ? JSON.stringify({
                s: lastTime.data.seconds,
                n: lastTime.data.nanoseconds,
                id: last.id,
              })
            : undefined,
      };
    },
  };
}

// Fixture mode: there is no account, so favorites stay in device storage only.
export const deviceFavoritesRepository: FavoritesRepository = {
  kind: "device",
  add: async () => undefined,
  remove: async () => undefined,
  list: async () => ({ items: [] }),
};
