import {
  ContentRepository,
  FavoritesRepository,
} from "../../repositories/contracts";
import { deviceFavoritesRepository } from "../../repositories/favoritesRepository";
import { mockContentRepository } from "../../repositories/mockRepository";
import { ProgressionRepository } from "../../repositories/progressionRepository";
import { SessionService } from "../auth/session";
import type { AccountBackend } from "../account/accountClient";
import { readBackendConfig } from "./config";
export type Backend = {
  mode: "fixture" | "emulator" | "cloud";
  content: ContentRepository;
  session: SessionService;
  // Omitted or "device": favorites stay in device storage only.
  favorites?: FavoritesRepository;
  // Omitted in fixture mode: practice works but earns nothing (D-050).
  progression?: ProgressionRepository;
  // Profile, Google sign-in and merge (doc 21). Omitted in fixture mode.
  account?: AccountBackend;
};
let pending: Promise<Backend> | undefined;
export function getBackend(): Promise<Backend> {
  if (!pending)
    pending = (async () => {
      const config = readBackendConfig();
      if (config.mode === "fixture")
        return {
          mode: config.mode,
          content: mockContentRepository,
          favorites: deviceFavoritesRepository,
          session: { ensureSession: async () => null },
        };
      // Resolves to client.native.ts (React Native Firebase) on Android/iOS
      // and client.ts (JavaScript SDK) on web.
      const { createFirebaseClient } = await import("../firebase/client");
      const { content, favorites, session, progression, account } =
        await createFirebaseClient(config);
      return {
        mode: config.mode,
        content,
        favorites,
        session,
        progression,
        account,
      };
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
