import { z } from "zod";
import { contentSchema, localizedSchema } from "../domain/models";
import { mediaVariantSchema as variant } from "../domain/media";
import { homeLanguages, homeLimits, homeSectionsSchema } from "../domain/home";

export const publishedContentSchema = contentSchema.extend({
  id: z.string().min(1),
  status: z.literal("PUBLISHED"),
  popularityScore: z.number().finite().nonnegative(),
  searchTokens: z.array(z.string().min(1)).max(200),
  durationSeconds: z.number().positive().optional(),
});
export const deityDocumentSchema = z.object({
  name: localizedSchema,
  isActive: z.literal(true),
  isMandirEnabled: z.boolean(),
  sortOrder: z.number().finite(),
  mandirArt: z.object({ mobile: variant }),
});
// Preserve Timestamp instances: copying their method onto a plain object loses
// the internal seconds/nanoseconds fields used by toMillis().
const timestamp = z.custom<{ toMillis(): number }>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function" &&
    Number.isFinite(value.toMillis()),
);
export const bannerDocumentSchema = z.object({
  title: localizedSchema,
  subtitle: localizedSchema,
  ctaText: localizedSchema,
  image: z.object({ mobile: variant }),
  target: z.unknown(),
  priority: z.number().finite(),
  isActive: z.literal(true),
  startAt: timestamp,
  endAt: timestamp,
});
// homeFeeds/{language}: written by the server (buildHomeFeed / seed), read by
// the app in one get. Banners are resolved copies of `banners/{id}`; the
// client still checks their window because a feed may be up to 15 min old.
export const homeFeedBannerSchema = bannerDocumentSchema
  .omit({ priority: true, isActive: true })
  .extend({ id: z.string().min(1).max(100) });
export const homeFeedDocumentSchema = z.object({
  language: z.enum(homeLanguages),
  isPublished: z.literal(true),
  schemaVersion: z.number().int().positive(),
  generatedAt: timestamp,
  banners: z
    .array(z.unknown())
    .max(homeLimits.banners)
    .transform((values) =>
      values.flatMap((value) => {
        const result = homeFeedBannerSchema.safeParse(value);
        return result.success ? [result.data] : [];
      }),
    ),
  sections: homeSectionsSchema,
});
