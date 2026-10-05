import { z } from "zod";
import type { PlaySource } from "../../features/player/playback";
export type TabParams = {
  Home: undefined;
  Explore: { category?: string } | undefined;
  Mandir: undefined;
  Sadhana: undefined;
  Profile: undefined;
};
// Doc 13 common content parameter: where the user opened the item from.
// Where content was opened from (doc 13 `source`); defined with the player.
export type ContentSource = PlaySource;
export type RootParams = {
  Main: undefined;
  Player: undefined;
  // `source` feeds the doc 13 analytics parameter of the same name.
  Content: { contentId: string; source?: PlaySource };
  Jaap: undefined;
  Meditation: undefined;
  Prayer: undefined;
};
const bannerTargetSchema = z.discriminatedUnion("route", [
  z.object({ route: z.literal("mandir") }).strict(),
  z.object({ route: z.literal("sadhana") }).strict(),
  z.object({ route: z.literal("explore") }).strict(),
]);
export type BannerTarget = z.infer<typeof bannerTargetSchema>;
export function resolveBannerTarget(input: unknown): keyof TabParams {
  const result = bannerTargetSchema.safeParse(input);
  if (!result.success) return "Home";
  return { mandir: "Mandir", sadhana: "Sadhana", explore: "Explore" }[
    result.data.route
  ] as keyof TabParams;
}
