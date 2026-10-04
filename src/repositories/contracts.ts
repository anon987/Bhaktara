import { Catalog, Content, ContentType } from "../domain/models";
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
