import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { assetKeySchema } from "../../domain/media";
import type { StoredProfile } from "./accountClient";

// users/{uid} as written by updateProfile; anything malformed reads as unset.
export function readStoredProfile(raw: unknown): StoredProfile {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    displayName:
      typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : null,
    photoKey: assetKeySchema.safeParse(data.photoKey).success
      ? (data.photoKey as string)
      : null,
  };
}

// The last profile seen for the signed-in account, so the header shows the
// name and photo offline; and the name being typed in Edit profile, so it is
// never lost (offline, a failed save or the app closing).
const cacheSchema = z.object({
  uid: z.string(),
  displayName: z.string().nullable(),
  photoKey: z.string().nullable(),
});
const draftSchema = z.object({ uid: z.string(), name: z.string() });
const CACHE_KEY = "bhaktara.account.profile.v1";
const DRAFT_KEY = "bhaktara.account.nameDraft.v1";

const readJson = async <T>(key: string, schema: z.ZodType<T>) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? schema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
};

export const profileCache = {
  async read(uid: string): Promise<StoredProfile | null> {
    const value = await readJson(CACHE_KEY, cacheSchema);
    return value && value.uid === uid
      ? { displayName: value.displayName, photoKey: value.photoKey }
      : null;
  },
  async write(uid: string, profile: StoredProfile) {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ uid, ...profile }));
  },
  async clear() {
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};

export const nameDraft = {
  async read(uid: string): Promise<string | null> {
    const value = await readJson(DRAFT_KEY, draftSchema);
    return value && value.uid === uid ? value.name : null;
  },
  async write(uid: string, name: string) {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ uid, name }));
  },
  async clear() {
    await AsyncStorage.removeItem(DRAFT_KEY);
  },
};
