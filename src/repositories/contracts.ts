import { Catalog, Content, ContentType } from "../domain/models";
import { HomeFeed, HomeLanguage } from "../domain/home";
import { DecorItem } from "../domain/mandirDecor";
export interface ContentQuery {
  query?: string;
  type?: ContentType;
  deityId?: string;
  offset?: number;
  cursor?: string;
  limit?: number;
}
export interface ContentRepository {
  getCatalog(): Promise<Catalog>;
  getById(id: string): Promise<Content | null>;
  search(
    query: ContentQuery,
  ): Promise<{ items: Content[]; nextOffset?: number; nextCursor?: string }>;
  // One read of the precomputed `homeFeeds/{language}` doc; null when none
  // has been published for that language yet.
  getHome(language: HomeLanguage): Promise<HomeFeed | null>;
  // Published mandir decor (mandirOfferings where isActive): temples,
  // lights, bells and flowers for the Prayer screen. Optional: the app's
  // bundled set is used when a repository has none or the read fails.
  getMandirDecor?(): Promise<DecorItem[]>;
}
// One `users/{uid}/favorites/{contentId}` record (doc 06).
export type FavoriteRecord = {
  contentId: string;
  type: ContentType;
  createdAtMs: number;
};
export interface FavoritesRepository {
  // "account": the session user's Firestore list (guests included, D-016).
  // "device": fixture mode; favorites live only in device storage.
  readonly kind: "account" | "device";
  // Idempotent: the doc ID is the content ID, so re-adding an existing
  // favorite succeeds. Without `type` the published content is read first.
  add(contentId: string, type?: ContentType): Promise<void>;
  // Idempotent: removing a missing favorite succeeds.
  remove(contentId: string): Promise<void>;
  // Newest first.
  list(input?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ items: FavoriteRecord[]; nextCursor?: string }>;
}
export interface ProgressionService {
  startSession(input: {
    type: "JAAP" | "MEDITATION";
    targetMalas?: number;
    targetMinutes?: number;
  }): Promise<{ sessionId: string }>;
  completeSession(input: {
    sessionId: string;
    malasCompleted?: number;
    minutesCompleted?: number;
  }): Promise<void>;
}
export interface AuthService {
  readonly isConnected: boolean;
  signIn(): Promise<"unavailable">;
}
