import { z } from "zod";
import { contentSchema, localizedSchema } from "../domain/models";
import { mediaVariantSchema as variant } from "../domain/media";

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
