import { z } from "zod";
import { mediaSchema } from "./media";
import type { Visuals } from "./visuals";
export const localizedSchema = z.object({ hi: z.string(), en: z.string() });
export const contentTypes = [
  "BHAJAN",
  "AARTI",
  "MANTRA",
  "CHALISA",
  "WALLPAPER",
  "RINGTONE",
  "STATUS",
] as const;
export const contentSchema = z.object({
  id: z.string(),
  type: z.enum(contentTypes),
  title: localizedSchema,
  description: localizedSchema,
  deityIds: z.array(z.string()),
  searchTokens: z.array(z.string()),
  media: mediaSchema,
  durationSeconds: z.number().optional(),
  saveGate: z.enum(["REWARDED", "FREE"]),
  isShareable: z.boolean(),
});
export type Content = z.infer<typeof contentSchema>;
export type ContentType = Content["type"];
export type Deity = {
  id: string;
  name: z.infer<typeof localizedSchema>;
  artKey: string;
  // D-057: the temple painted with the deity (Prayer) and the symbol shown
  // above the mantra (Jaap). Without them the app draws its own.
  shrineKey?: string;
  emblemKey?: string;
  // The deity alone on a transparent background (deities.murtiArt), stood
  // in the temple the devotee swipes to on the Prayer screen.
  murtiKey?: string;
};
export type Banner = {
  id: string;
  title: z.infer<typeof localizedSchema>;
  subtitle: z.infer<typeof localizedSchema>;
  cta: z.infer<typeof localizedSchema>;
  artKey: string;
  target: unknown;
};
export type Challenge = {
  id: string;
  title: z.infer<typeof localizedSchema>;
  period: "DAILY" | "WEEKLY";
  progress: number;
  target: number;
  xpReward: number;
};
export type Catalog = {
  content: Content[];
  deities: Deity[];
  banners: Banner[];
  challenges: Challenge[];
  sampleStats: { totalXp: number; level: number; currentStreak: number };
  // appConfig/visuals; absent in fixture mode or before it is first saved.
  visuals?: Visuals;
};
export type CatalogMode = "ready" | "loading" | "error" | "empty" | "offline";
