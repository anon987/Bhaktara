import { z } from "zod";
import { Banner, Content, contentTypes, localizedSchema } from "./models";
import { mediaVariantSchema } from "./media";

// CMS-driven Home (doc 03 §3, doc 06 §3, doc 09 §6).
//
// `homeLayout/{language}` is the admin-only source the CMS edits.
// `homeFeeds/{language}` is precomputed from it by `buildHomeFeed` (doc 08) and
// is the only document the app reads for Home: one read per language, with
// rail cards denormalized to card-level fields. Banners stay fixed at the top
// (D-030) and are stored beside the sections, never as an orderable section.

export const homeLanguages = ["hi", "en"] as const;
export type HomeLanguage = (typeof homeLanguages)[number];

// Doc 06 §3 type whitelist. BANNERS is fixed first and lives in `banners`.
export const homeSectionTypes = [
  "BANNERS",
  "PROGRESS",
  "SHORTCUTS",
  "SADHANA",
  "CHALLENGES",
  "LEAGUE",
  "FESTIVALS",
  "RAIL",
  "QUOTE",
] as const;
export type HomeSectionType = (typeof homeSectionTypes)[number];

export const homeLimits = {
  banners: 10,
  sections: 30,
  shortcuts: 12,
  railItems: 20,
} as const;

// Parses each entry on its own and drops the ones that fail, so a single
// malformed or newer-than-this-app entry never blanks the whole Home.
function lenientArray<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(z.unknown())
    .max(max)
    .transform((values) =>
      values.flatMap((value) => {
        const result = item.safeParse(value);
        return result.success ? [result.data as z.output<T>] : [];
      }),
    );
}

// Internal targets only (D-015). Unknown targets are dropped, never opened.
export const homeTargetSchema = z.discriminatedUnion("route", [
  z
    .object({
      route: z.literal("explore"),
      params: z
        .object({ category: z.enum(contentTypes) })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ route: z.literal("mandir") }).strict(),
  z.object({ route: z.literal("sadhana") }).strict(),
]);
export type HomeTarget = z.infer<typeof homeTargetSchema>;

export const homeShortcutSchema = z.object({
  label: localizedSchema,
  iconKey: z.string().min(1).max(40),
  target: homeTargetSchema,
});
export type HomeShortcut = z.infer<typeof homeShortcutSchema>;

// Card-level fields only (doc 06 §3): enough to draw a rail card without
// reading the content document.
export const homeCardSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(contentTypes),
  title: localizedSchema,
  media: z.object({ thumb: mediaVariantSchema }),
  durationSeconds: z.number().positive().optional(),
});
export type HomeCard = z.infer<typeof homeCardSchema>;

export const homeRailSourceSchema = z.object({
  collectionId: z.string().min(1).max(200).optional(),
  contentType: z.enum(contentTypes).optional(),
  sort: z.enum(["POPULAR", "NEW"]).optional(),
});

const base = {
  id: z.string().min(1).max(100),
  title: localizedSchema.optional(),
  order: z.number().finite(),
  visible: z.boolean(),
};
// Only the types this app version can draw. Any other type (including
// whitelisted ones not built yet: CHALLENGES, LEAGUE, FESTIVALS) fails this
// union and is ignored, which keeps older apps safe when the CMS grows.
export const homeSectionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("PROGRESS") }),
  z.object({ ...base, type: z.literal("SADHANA") }),
  z.object({
    ...base,
    type: z.literal("SHORTCUTS"),
    items: lenientArray(homeShortcutSchema, homeLimits.shortcuts),
  }),
  z.object({
    ...base,
    type: z.literal("RAIL"),
    title: localizedSchema,
    source: homeRailSourceSchema.optional(),
    items: lenientArray(homeCardSchema, homeLimits.railItems),
  }),
  z.object({
    ...base,
    type: z.literal("QUOTE"),
    text: localizedSchema,
    attribution: localizedSchema.optional(),
  }),
]);
export type HomeSection = z.infer<typeof homeSectionSchema>;
export const homeSectionsSchema = lenientArray(
  homeSectionSchema,
  homeLimits.sections,
);

// Visible sections in configured order. Empty rails and shortcut rows are
// skipped so a stale feed never shows a bare heading.
export function orderHomeSections(sections: HomeSection[]): HomeSection[] {
  const seen = new Set<string>();
  return sections
    .filter((section) => {
      if (!section.visible || seen.has(section.id)) return false;
      seen.add(section.id);
      return (
        (section.type !== "RAIL" && section.type !== "SHORTCUTS") ||
        section.items.length > 0
      );
    })
    .map((section, index) => ({ section, index }))
    .sort((a, b) => a.section.order - b.section.order || a.index - b.index)
    .map(({ section }) => section);
}

export const parseHomeSections = (value: unknown) =>
  orderHomeSections(homeSectionsSchema.parse(value));

export type HomeFeed = {
  language: HomeLanguage;
  banners: Banner[];
  sections: HomeSection[];
};

// ---- Feed builder (shared by fixtures, the seed and, later, buildHomeFeed) ----

// A `homeLayout/{language}` section as the CMS stores it (doc 06 §3).
export type HomeLayoutSection = {
  id: string;
  type: HomeSectionType;
  title?: { hi: string; en: string };
  source?: z.infer<typeof homeRailSourceSchema>;
  limit?: number;
  visible: boolean;
  order: number;
  items?: HomeShortcut[];
  text?: { hi: string; en: string };
  attribution?: { hi: string; en: string };
};
export type HomeCollection = { id: string; itemIds: string[] };

export const toHomeCard = (item: Content): HomeCard => ({
  id: item.id,
  type: item.type,
  title: item.title,
  media: { thumb: item.media.thumb },
  ...(item.durationSeconds ? { durationSeconds: item.durationSeconds } : {}),
});

// Resolves a layout into feed sections. `content` must already be published
// and in popularity order. Hidden sections and BANNERS are left out; rails
// carry denormalized cards so the client needs no further reads.
export function buildHomeFeedSections(
  layout: HomeLayoutSection[],
  content: Content[],
  collections: HomeCollection[] = [],
): Record<string, unknown>[] {
  const byId = new Map(content.map((item) => [item.id, item]));
  return layout
    .filter((section) => section.visible && section.type !== "BANNERS")
    .map((section) => {
      const { limit, ...rest } = section;
      if (section.type !== "RAIL") return { ...rest };
      const size = Math.min(Math.max(limit ?? 10, 1), homeLimits.railItems);
      const collection = section.source?.collectionId
        ? collections.find((value) => value.id === section.source?.collectionId)
        : undefined;
      const pool = section.source?.collectionId
        ? (collection?.itemIds ?? []).flatMap((id) => byId.get(id) ?? [])
        : content.filter(
            (item) =>
              !section.source?.contentType ||
              item.type === section.source.contentType,
          );
      return { ...rest, items: pool.slice(0, size).map(toHomeCard) };
    });
}
