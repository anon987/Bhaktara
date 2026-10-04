import { ContentRepository } from "../../repositories/contracts";
import { mockContentRepository } from "../../repositories/mockRepository";
import { SessionService } from "../auth/session";
import { readBackendConfig } from "./config";
export type Backend = {
  mode: "fixture" | "emulator";
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
      const [{ createFirebaseClient }, { createFirestoreRepository }] =
        await Promise.all([
          import("../firebase/client"),
          import("../../repositories/firestoreRepository"),
        ]);
      const { db, session } = createFirebaseClient(config);
      return {
        mode: config.mode,
        content: createFirestoreRepository(db, session),
        session,
      };
    })().catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
