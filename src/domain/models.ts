import { z } from "zod";
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
  media: z.object({ thumb: z.object({ key: z.string() }) }),
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
};
export type CatalogMode = "ready" | "loading" | "error" | "empty" | "offline";
