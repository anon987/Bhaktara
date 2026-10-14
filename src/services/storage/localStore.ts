import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
const timerSchema = z.object({
  durationSeconds: z.number().positive(),
  remainingSeconds: z.number().nonnegative(),
  endsAt: z.number().nullable(),
  // Server practice session for this sitting (null offline or in fixture mode).
  sessionId: z.string().nullable().default(null),
});
export const localStateSchema = z
  .object({
    language: z.enum(["en", "hi"]),
    onboarded: z.boolean(),
    favorites: z.array(z.string()),
    deityId: z.string().nullable(),
    // Beads chanted on `jaapDay` (D-051: the count starts again at 04:00).
    jaapCount: z.number().int().nonnegative(),
    jaapDay: z.string().nullable().default(null),
    // Server session of the mala in progress, kept across app restarts.
    jaapSessionId: z.string().nullable().default(null),
    timer: timerSchema,
    // Practice screens' sound (bell, ghanti, shankh) and bead haptics.
    practice: z
      .object({ sound: z.boolean(), vibration: z.boolean() })
      .default({ sound: true, vibration: true }),
    // One-time hints already shown (e.g. "wallpaperSwipe").
    seenHints: z.array(z.string()).default([]),
    // Prayer screen mandir decor: the devotee's temple, light and bell (null:
    // the first free one; lightId "none": no lights) and the decor unlocked
    // for good on this device with a rewarded ad.
    mandir: z
      .object({
        templeId: z.string().nullable(),
        lightId: z.string().nullable(),
        bellId: z.string().nullable(),
        unlocked: z.array(z.string()),
      })
      .default({ templeId: null, lightId: null, bellId: null, unlocked: [] }),
    days: z.record(
      z.string(),
      z.object({
        jaap: z.boolean(),
        meditation: z.boolean(),
        prayer: z.boolean(),
      }),
    ),
  })
  .strict();
export type LocalState = z.infer<typeof localStateSchema>;
export const initialState: LocalState = {
  language: "hi",
  onboarded: false,
  favorites: [],
  deityId: null,
  jaapCount: 0,
  jaapDay: null,
  jaapSessionId: null,
  timer: {
    durationSeconds: 300,
    remainingSeconds: 300,
    endsAt: null,
    sessionId: null,
  },
  practice: { sound: true, vibration: true },
  seenHints: [],
  mandir: { templeId: null, lightId: null, bellId: null, unlocked: [] },
  days: {},
};
const KEY = "bhaktara.local.v1";
export interface LocalStore {
  read(): Promise<LocalState>;
  write(state: LocalState): Promise<void>;
}
export const localStore: LocalStore = {
  async read() {
    const value = await AsyncStorage.getItem(KEY);
    return value ? localStateSchema.parse(JSON.parse(value)) : initialState;
  },
  async write(state) {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  },
};
