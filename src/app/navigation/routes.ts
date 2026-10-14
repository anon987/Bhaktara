import { z } from "zod";
import type { ContentType } from "../../domain/models";
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
  // Explore, second step: the gods with published items of the chosen type.
  ChooseDeity: { type: ContentType; source?: PlaySource };
  // Explore: one deity's published items of one type (wallpaper and status
  // viewers open on the first; audio types list them).
  DeityContent: { deityId: string; type: ContentType; source?: PlaySource };
  Jaap: undefined;
  Meditation: undefined;
  // Profile: every milestone, and the name and photo editor.
  Milestones: undefined;
  EditProfile: undefined;
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
