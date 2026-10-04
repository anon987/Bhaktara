import { ContentRepository } from "../../repositories/contracts";
import { mockContentRepository } from "../../repositories/mockRepository";
import { SessionService } from "../auth/session";
import { readBackendConfig } from "./config";
export type Backend = {
  mode: "fixture" | "emulator" | "cloud";
  content: ContentRepository;
  session: SessionService;
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
          session: { ensureSession: async () => null },
        };
      // Resolves to client.native.ts (React Native Firebase) on Android/iOS
      // and client.ts (JavaScript SDK) on web.
      const { createFirebaseClient } = await import("../firebase/client");
      const { content, session } = await createFirebaseClient(config);
      return { mode: config.mode, content, session };
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
