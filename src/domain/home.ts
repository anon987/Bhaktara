import { z } from "zod";
import { Banner, Content, contentTypes, localizedSchema } from "./models";
import { MediaVariant, mediaVariantSchema } from "./media";

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

// ---- Layout documents (`homeLayout/{language}`, doc 06 §3, doc 09 §6) ----
//
// Strict schemas for what the CMS may store. The Home manager callables
// validate with them before writing, and buildHomeFeed re-validates the stored
// document before building, so a layout written out of band (console, script)
// never produces a feed the app would half-drop.

export const homeRailSorts = ["POPULAR", "NEW"] as const;
export type HomeRailSort = (typeof homeRailSorts)[number];
export const homeRailDefaultLimit = 10;

const layoutId = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,99}$/,
    "must be a lowercase id (a-z, 0-9, _ or -)",
  );
const layoutText = (max: number) =>
  z
    .object({
      hi: z.string().trim().max(max),
      en: z.string().trim().max(max),
    })
    .strict();
const requiredText = (max: number) =>
  layoutText(max).refine(
    (value) => value.hi !== "" && value.en !== "",
    "both languages are required",
  );
const layoutBase = {
  id: layoutId,
  title: layoutText(80).optional(),
  order: z.number().int().min(0).max(1_000_000),
  visible: z.boolean(),
};
const plainSection = <T extends HomeSectionType>(type: T) =>
  z.object({ ...layoutBase, type: z.literal(type) }).strict();

export const homeShortcutInputSchema = z
  .object({
    label: requiredText(30),
    iconKey: z.string().regex(/^[a-z0-9_-]{1,40}$/, "use a known icon key"),
    target: homeTargetSchema,
  })
  .strict();
// Rail source (doc 06 §3): a collection (editorial order) or all published
// content, optionally narrowed to one type and sorted by popularity (the
// default for content-wide rails) or newest first.
export const homeRailSourceInputSchema = z
  .object({
    collectionId: layoutId.optional(),
    contentType: z.enum(contentTypes).optional(),
    sort: z.enum(homeRailSorts).optional(),
  })
  .strict();

export const homeLayoutSectionSchema = z.discriminatedUnion("type", [
  plainSection("BANNERS"),
  plainSection("PROGRESS"),
  plainSection("SADHANA"),
  plainSection("CHALLENGES"),
  plainSection("LEAGUE"),
  plainSection("FESTIVALS"),
  z
    .object({
      ...layoutBase,
      type: z.literal("SHORTCUTS"),
      items: z.array(homeShortcutInputSchema).max(homeLimits.shortcuts),
    })
    .strict(),
  z
    .object({
      ...layoutBase,
      type: z.literal("RAIL"),
      title: requiredText(80),
      source: homeRailSourceInputSchema.optional(),
      limit: z.number().int().min(1).max(homeLimits.railItems).optional(),
    })
    .strict(),
  z
    .object({
      ...layoutBase,
      type: z.literal("QUOTE"),
      text: requiredText(300),
      attribution: layoutText(120).optional(),
    })
    .strict(),
]);
export const homeLayoutSectionsSchema = z
  .array(homeLayoutSectionSchema)
  .max(homeLimits.sections)
  .superRefine((sections, context) => {
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      if (seen.has(section.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate section id ${section.id}`,
        });
      seen.add(section.id);
    });
    if (sections.filter((section) => section.type === "BANNERS").length > 1)
      context.addIssue({
        code: "custom",
        path: [],
        message: "only one BANNERS section is allowed",
      });
  });
export type HomeLayoutSectionInput = z.input<typeof homeLayoutSectionSchema>;
// The stored document. `revision`, `updatedAt` and `updatedBy` are written by
// the callable beside `sections` and are not part of the validated layout.
export const homeLayoutDocumentSchema = z.object({
  sections: homeLayoutSectionsSchema,
});

// ---- Feed builder (shared by the buildHomeFeed function, fixtures and seed) ----

// A `homeLayout/{language}` section as the builder reads it. Looser than
// homeLayoutSectionSchema so typed fixtures can be written inline.
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

// What a rail needs from a published content item: card fields plus the two
// ranking fields (`publishedAt` in epoch milliseconds).
export type HomeCardSource = Pick<
  Content,
  "id" | "type" | "title" | "durationSeconds"
> & {
  media: { thumb: MediaVariant };
  popularityScore?: number;
  publishedAt?: number;
};
export const homeCardSourceSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(contentTypes),
  title: localizedSchema,
  media: z.object({ thumb: mediaVariantSchema }),
  durationSeconds: z.number().positive().optional(),
  popularityScore: z.number().finite().optional(),
  publishedAt: z.number().finite().optional(),
});

export const toHomeCard = (item: HomeCardSource): HomeCard => ({
  id: item.id,
  type: item.type,
  title: { hi: item.title.hi, en: item.title.en },
  media: { thumb: item.media.thumb },
  ...(item.durationSeconds ? { durationSeconds: item.durationSeconds } : {}),
});

export const homeRailLimit = (section: Pick<HomeLayoutSection, "limit">) =>
  Math.min(
    Math.max(Math.trunc(section.limit ?? homeRailDefaultLimit), 1),
    homeLimits.railItems,
  );

// Ties break by document ID ascending, like the explicit
// orderBy(documentId()) of the server pool queries and the app's catalog.
const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
// Items without a score (fixtures) keep their input order.
const byPopularity = (items: HomeCardSource[]) =>
  [...items].sort(
    (a, b) =>
      (b.popularityScore ?? 0) - (a.popularityScore ?? 0) ||
      (a.popularityScore !== undefined && b.popularityScore !== undefined
        ? byId(a, b)
        : 0),
  );
// Items never published have no `publishedAt`; a Firestore orderBy leaves
// them out too.
const byNewest = (items: HomeCardSource[]) =>
  items
    .filter((item) => item.publishedAt !== undefined)
    .sort((a, b) => b.publishedAt! - a.publishedAt! || byId(a, b));

// The cards of one rail. Collections keep their editorial order unless a sort
// is set; content-wide rails default to POPULAR. A content type narrows both.
export function resolveRailItems(
  section: Pick<HomeLayoutSection, "source" | "limit">,
  content: HomeCardSource[],
  collections: HomeCollection[] = [],
): HomeCardSource[] {
  const source = section.source ?? {};
  let pool = content;
  if (source.collectionId) {
    const items = new Map(content.map((item) => [item.id, item]));
    const itemIds =
      collections.find((value) => value.id === source.collectionId)?.itemIds ??
      [];
    pool = [...new Set(itemIds)].flatMap((id) => items.get(id) ?? []);
  }
  if (source.contentType)
    pool = pool.filter((item) => item.type === source.contentType);
  if (source.sort === "NEW") pool = byNewest(pool);
  else if (source.sort === "POPULAR" || !source.collectionId)
    pool = byPopularity(pool);
  return pool.slice(0, homeRailLimit(section));
}

// Resolves a layout into feed sections, in `order` (ties keep layout order).
// `content` holds published items only. When it is a partial set (the
// function reads bounded pools) it must contain each rail's top items.
// Hidden sections, BANNERS and
// duplicate IDs are left out; rails carry card-level fields only, so the
// client needs no further reads. Other types pass through unchanged
// (FESTIVALS is not resolved yet; the app skips types it cannot draw).
export function buildHomeFeedSections(
  layout: HomeLayoutSection[],
  content: HomeCardSource[],
  collections: HomeCollection[] = [],
): Record<string, unknown>[] {
  const seen = new Set<string>();
  return layout
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => {
      if (!section.visible || section.type === "BANNERS") return false;
      if (seen.has(section.id)) return false;
      seen.add(section.id);
      return true;
    })
    .sort((a, b) => a.section.order - b.section.order || a.index - b.index)
    .map(({ section }) => {
      const { limit: _limit, ...rest } = section;
      if (section.type !== "RAIL") return { ...rest };
      return {
        ...rest,
        items: resolveRailItems(section, content, collections).map(toHomeCard),
      };
    });
}

// ---- Banners (doc 06 §3, D-030): resolved copies stored beside the sections.

type Instant = { toMillis(): number };
export type HomeBannerSource<T extends Instant> = {
  id: string;
  title: { hi: string; en: string };
  subtitle: { hi: string; en: string };
  ctaText: { hi: string; en: string };
  image: { mobile: MediaVariant; thumb?: MediaVariant };
  target: unknown;
  priority: number;
  startAt: T;
  endAt: T;
  isActive: boolean;
  languages?: readonly string[];
};

// Active banners for one language whose window contains `now`, by priority
// (ties by id), at most homeLimits.banners. Expired, future, inactive and
// other-language banners are dropped. Banners without `languages` show in both.
export function resolveHomeBanners<T extends Instant>(
  banners: HomeBannerSource<T>[],
  language: HomeLanguage,
  now: number,
) {
  return banners
    .filter(
      (banner) =>
        banner.isActive === true &&
        banner.startAt.toMillis() <= now &&
        now < banner.endAt.toMillis() &&
        (banner.languages ?? homeLanguages).includes(language),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, homeLimits.banners)
    .map((banner) => ({
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle,
      ctaText: banner.ctaText,
      image: {
        mobile: banner.image.mobile,
        ...(banner.image.thumb ? { thumb: banner.image.thumb } : {}),
      },
      target: banner.target,
      startAt: banner.startAt,
      endAt: banner.endAt,
    }));
}

// The next instant an active banner starts or ends, so the scheduled build
// refreshes the feed when its banner set changes.
export function nextHomeBannerChange<T extends Instant>(
  banners: HomeBannerSource<T>[],
  now: number,
): number | null {
  const upcoming = banners
    .filter((banner) => banner.isActive === true)
    .flatMap((banner) => [banner.startAt.toMillis(), banner.endAt.toMillis()])
    .filter((at) => at > now);
  return upcoming.length ? Math.min(...upcoming) : null;
}
