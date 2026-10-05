import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { contentTypes } from "../../domain/models";
import { favoriteIdSchema } from "../../repositories/favoritesRepository";

// Durable state of account favorites sync, kept apart from the debounced
// LocalState write so a pending change is on disk before it is sent.
const pendingWriteSchema = z.object({
  contentId: favoriteIdSchema,
  op: z.enum(["add", "remove"]),
  type: z.enum(contentTypes).optional(),
  // Increases with every local change; a confirmation only clears the entry
  // it was sent for, never a newer change to the same item.
  seq: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
});
export const favoritesSyncStateSchema = z.object({
  // Account the queue belongs to; writes can only go to the caller's own list.
  uid: z.string().nullable(),
  // Accounts that already received this device's favorites (migrate once).
  migrated: z.array(z.string()),
  seq: z.number().int().nonnegative(),
  queue: z.array(pendingWriteSchema),
});
export type PendingFavoriteWrite = z.infer<typeof pendingWriteSchema>;
export type FavoritesSyncState = z.infer<typeof favoritesSyncStateSchema>;
export const initialFavoritesSyncState: FavoritesSyncState = {
  uid: null,
  migrated: [],
  seq: 0,
  queue: [],
};

export interface FavoritesSyncStore {
  read(): Promise<FavoritesSyncState>;
  write(state: FavoritesSyncState): Promise<void>;
}
const KEY = "bhaktara.favorites.sync.v1";
export const favoritesSyncStore: FavoritesSyncStore = {
  async read() {
    const value = await AsyncStorage.getItem(KEY);
    if (!value) return initialFavoritesSyncState;
    // Unreadable sync state is reset rather than blocking the app: re-adding
    // device favorites is idempotent, so the only loss is unsent removals.
    try {
      return favoritesSyncStateSchema.parse(JSON.parse(value));
    } catch {
      return initialFavoritesSyncState;
    }
  },
  async write(state) {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  },
};
