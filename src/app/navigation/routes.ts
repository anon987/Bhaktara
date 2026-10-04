import { z } from "zod";
export type TabParams = {
  Home: undefined;
  Explore: { category?: string } | undefined;
  Mandir: undefined;
  Sadhana: undefined;
  Profile: undefined;
};
export type RootParams = {
  Main: undefined;
  Player: undefined;
  Content: { contentId: string };
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
