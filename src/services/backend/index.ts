import {
  ContentRepository,
  FavoritesRepository,
} from "../../repositories/contracts";
import { deviceFavoritesRepository } from "../../repositories/favoritesRepository";
import { mockContentRepository } from "../../repositories/mockRepository";
import { SessionService } from "../auth/session";
import { readBackendConfig } from "./config";
export type Backend = {
  mode: "fixture" | "emulator" | "cloud";
  content: ContentRepository;
  session: SessionService;
  // Omitted or "device": favorites stay in device storage only.
  favorites?: FavoritesRepository;
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
      const { content, favorites, session } =
        await createFirebaseClient(config);
      return { mode: config.mode, content, favorites, session };
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
