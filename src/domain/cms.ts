import { z } from "zod";
import { contentTypes, ContentType } from "./models";
import {
  mediaVariantNames,
  mediaVariantSchema,
  MediaVariantName,
} from "./media";
import { checkItems } from "./checklist";
import { homeLanguages, homeLayoutSectionsSchema } from "./home";

// Admin CMS domain rules (doc 09), shared by the Cloud Functions that enforce
// them and the admin web app that explains them. Pure: no Firebase imports.

// ---- Roles (doc 09 §15). One custom claim per account: { role: AdminRole }.
export const adminRoles = [
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "EDITOR",
  "MODERATOR",
  "ANALYST",
] as const;
export type AdminRole = (typeof adminRoles)[number];
export const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === "string" &&
  (adminRoles as readonly string[]).includes(value);

// Keep in sync with the admin match blocks in firestore.rules (tested per
// role by emulator-tests/admin-rules.test.ts).
export const permissions = {
  "content.read": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  "content.edit": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  "content.upload": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  "content.publish": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "banner.read": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "banner.write": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "home.read": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "home.write": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "audit.read": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "role.read": ["SUPER_ADMIN"],
  "role.write": ["SUPER_ADMIN"],
  // Admin panel v2 (doc 09 §1): dashboard, users, catalogue and config.
  "dashboard.read": [
    "SUPER_ADMIN",
    "CONTENT_ADMIN",
    "EDITOR",
    "MODERATOR",
    "ANALYST",
  ],
  "user.read": ["SUPER_ADMIN", "MODERATOR"],
  "user.moderate": ["SUPER_ADMIN", "MODERATOR"],
  "user.manage": ["SUPER_ADMIN"],
  "catalog.read": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR", "ANALYST"],
  "catalog.write": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "asset.read": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  "asset.write": ["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"],
  "config.read": ["SUPER_ADMIN", "CONTENT_ADMIN", "ANALYST"],
  "config.write": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly AdminRole[]>;
export type Permission = keyof typeof permissions;
export const can = (
  role: AdminRole | null | undefined,
  permission: Permission,
) => !!role && (permissions[permission] as readonly AdminRole[]).includes(role);

// ---- Workflow (D-036): DRAFT → READY → SCHEDULED → PUBLISHED → ARCHIVED.
export const contentStatuses = [
  "DRAFT",
  "READY",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type ContentStatus = (typeof contentStatuses)[number];

// Allowed moves and the permission each needs (doc 08 §3: EDITOR may move to
// READY; CONTENT_ADMIN schedules, publishes, unpublishes and archives).
export const transitions: Record<
  ContentStatus,
  Partial<Record<ContentStatus, Permission>>
> = {
  DRAFT: { READY: "content.edit", ARCHIVED: "content.publish" },
  READY: {
    DRAFT: "content.edit",
    SCHEDULED: "content.publish",
    PUBLISHED: "content.publish",
  },
  SCHEDULED: { READY: "content.publish", PUBLISHED: "content.publish" },
  // PUBLISHED → DRAFT unpublishes an item for a fix (doc 09 §3).
  PUBLISHED: { DRAFT: "content.publish", ARCHIVED: "content.publish" },
  ARCHIVED: { DRAFT: "content.publish" },
};
// Entering these states needs the required fields (readinessProblems).
export const gatedStatuses: readonly ContentStatus[] = [
  "READY",
  "SCHEDULED",
  "PUBLISHED",
];
// Fields are edited only in DRAFT; live items go back to DRAFT first.
export const editableStatuses: readonly ContentStatus[] = ["DRAFT"];

export function allowedTransitions(
  from: ContentStatus,
  role: AdminRole | null | undefined,
): ContentStatus[] {
  return (Object.entries(transitions[from]) as [ContentStatus, Permission][])
    .filter(([, permission]) => can(role, permission))
    .map(([to]) => to);
}

// ---- Input schemas (validated again by the functions; never trust the UI).
export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,99}$/,
    "must be a lowercase slug (a-z, 0-9, _ or -)",
  );
const localized = (max: number) =>
  z
    .object({
      hi: z.string().trim().max(max),
      en: z.string().trim().max(max),
    })
    .strict();
const bothLanguages = (value: { hi: string; en: string }) =>
  value.hi !== "" && value.en !== "";
const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );
// ISO-8601 instant with an explicit offset, e.g. 2026-11-01T04:30:00.000Z.
export const isoInstantSchema = z.iso.datetime({ offset: true });

export const draftMediaSchema = z
  .object(
    Object.fromEntries(
      mediaVariantNames.map((name) => [name, mediaVariantSchema.optional()]),
    ) as Record<MediaVariantName, z.ZodOptional<typeof mediaVariantSchema>>,
  )
  .strict();
export type DraftMedia = z.infer<typeof draftMediaSchema>;

// Optional provenance notes. None of these gate READY any more; they are kept
// so existing documents and the bulk importer still round-trip.
export const contentPrivateInputSchema = z
  .object({
    sourceText: optionalText(20000),
    sourceTextRef: optionalText(300),
    aiTool: optionalText(100),
    aiPlan: optionalText(100),
    licenseRecordId: optionalText(100),
    checklist: z.partialRecord(z.enum(checkItems), z.boolean()).default({}),
  })
  .strict();

// The operator-editable part of a content item: public fields plus the
// private provenance panel (stored in contentPrivate). Server-owned fields
// (status, searchTokens, popularityScore, publishedAt, timestamps) are absent.
export const contentDraftSchema = z
  .object({
    type: z.enum(contentTypes),
    title: localized(120),
    description: localized(600),
    audioLanguage: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z
        .string()
        .regex(/^[a-z]{2,3}$/, "use a language code such as hi or sa")
        .optional(),
    ),
    deityIds: z.array(slugSchema).max(10),
    categoryIds: z.array(slugSchema).max(10),
    tags: z.array(z.string().trim().min(1).max(60)).max(40),
    media: draftMediaSchema,
    durationSeconds: z.number().positive().max(86400).optional(),
    isFeatured: z.boolean(),
    saveGate: z.enum(["REWARDED", "FREE"]),
    isShareable: z.boolean(),
    adEligible: z.boolean(),
    expireAt: isoInstantSchema.optional(),
    private: contentPrivateInputSchema,
  })
  .strict();
export type ContentDraft = z.infer<typeof contentDraftSchema>;
export type ContentDraftInput = z.input<typeof contentDraftSchema>;

// Callers may omit the private panel entirely; it is optional data.
const draftInputSchema = z.preprocess(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).private === undefined
      ? { ...value, private: {} }
      : value,
  contentDraftSchema,
);

export const saveContentSchema = z
  .object({ id: slugSchema, draft: draftInputSchema })
  .strict();
// createContent: the ID is generated server-side when it is missing or blank
// (operators never type IDs); the bulk uploader still sends explicit ones.
export const createContentSchema = z
  .object({
    id: z.preprocess(
      (value) =>
        value === null || (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      slugSchema.optional(),
    ),
    draft: draftInputSchema,
  })
  .strict();
export const transitionSchema = z
  .object({
    contentId: slugSchema,
    to: z.enum(contentStatuses),
    scheduledAt: isoInstantSchema.optional(),
  })
  .strict();
export type TransitionInput = z.infer<typeof transitionSchema>;

// ---- Bulk actions (bulkContent callable). Every item is processed on its
// own (one transaction each), so one failing item never blocks the rest.
export const BULK_MAX_IDS = 200;
export const bulkListModes = ["add", "remove", "replace"] as const;
export type BulkListMode = (typeof bulkListModes)[number];
const bulkListPatch = <T extends z.ZodType<string>>(value: T) =>
  z
    .object({
      mode: z.enum(bulkListModes),
      values: z
        .array(value)
        .max(40)
        .refine((list) => new Set(list).size === list.length, {
          message: "duplicate value",
        }),
    })
    .strict();
// Metadata only: titles, descriptions, media and the private panel are never
// changed in bulk.
export const bulkPatchSchema = z
  .object({
    deityIds: bulkListPatch(slugSchema).optional(),
    categoryIds: bulkListPatch(slugSchema).optional(),
    tags: bulkListPatch(z.string().trim().min(1).max(60)).optional(),
    isFeatured: z.boolean().optional(),
    isShareable: z.boolean().optional(),
    adEligible: z.boolean().optional(),
    saveGate: z.enum(["FREE", "REWARDED"]).optional(),
  })
  .strict()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    { message: "choose at least one change" },
  );
export type BulkPatch = z.infer<typeof bulkPatchSchema>;
export type BulkListPatch = { mode: BulkListMode; values: string[] };

export const bulkActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("transition"),
      to: z.enum(contentStatuses),
      scheduledAt: isoInstantSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("update"), patch: bulkPatchSchema }).strict(),
  z.object({ kind: z.literal("delete") }).strict(),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

export const bulkContentSchema = z
  .object({
    ids: z
      .array(slugSchema)
      .min(1)
      .max(BULK_MAX_IDS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "duplicate ID",
      }),
    action: bulkActionSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.action.kind === "transition" &&
      input.action.to === "SCHEDULED" &&
      !input.action.scheduledAt
    )
      ctx.addIssue({
        code: "custom",
        path: ["action", "scheduledAt"],
        message: "a publish time is required to schedule",
      });
  });
export type BulkContentInput = z.infer<typeof bulkContentSchema>;

export type BulkItemResult = {
  id: string;
  ok: boolean;
  // The item's status after the action (current status when it failed and
  // the item exists). Absent for deleted or missing items.
  status?: ContentStatus;
  problems?: ReadinessProblem[];
  error?: string;
};
export type BulkContentResult = { results: BulkItemResult[] };

// Applies an add/remove/replace patch to a list, keeping order and
// dropping duplicates.
export function applyListPatch(
  current: readonly string[],
  patch: BulkListPatch | undefined,
): string[] {
  if (!patch) return [...current];
  switch (patch.mode) {
    case "add":
      return [...new Set([...current, ...patch.values])];
    case "remove": {
      const removed = new Set(patch.values);
      return current.filter((value) => !removed.has(value));
    }
    case "replace":
      return [...new Set(patch.values)];
  }
}

// Whether an item may be deleted permanently: archived, or a draft that was
// never published.
export const deletableContent = (content: {
  status?: unknown;
  publishedAt?: unknown;
}) =>
  content.status === "ARCHIVED" ||
  (content.status === "DRAFT" && content.publishedAt == null);

// D-038/D-041: device saves of wallpapers, ringtones and status are rewarded.
export const defaultSaveGate = (type: ContentType): "REWARDED" | "FREE" =>
  ["WALLPAPER", "RINGTONE", "STATUS"].includes(type) ? "REWARDED" : "FREE";

// Doc 22 §A3 variant slots per type; thumb is always required.
export function requiredVariants(type: ContentType): MediaVariantName[] {
  switch (type) {
    case "WALLPAPER":
      return ["thumb", "mobile", "full"];
    case "RINGTONE":
      return ["thumb", "file"];
    case "STATUS":
      return ["thumb", "poster", "video720"];
    default:
      return ["thumb", "stream"];
  }
}

export type ReadinessProblem = { field: string; message: string };

// Devotional audio types whose listing shows a description; wallpapers,
// ringtones and status videos may go live with titles alone.
export const descriptionRequiredTypes: readonly ContentType[] = [
  "BHAJAN",
  "AARTI",
  "MANTRA",
  "CHALISA",
];

// Types the app shows without a title or description (wallpapers are images
// only): the name from the file is enough, in either language.
export const nameOnlyTypes: readonly ContentType[] = ["WALLPAPER"];

// Everything that blocks DRAFT → READY (doc 09 §3). The editor shows the same
// list that transitionContentStatus returns. Provenance (AI tool/plan, licence,
// source text) and the doc 12 §5 checklist are optional notes, never gates.
export function readinessProblems(draft: ContentDraft): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  const need = (ok: unknown, field: string, message: string) => {
    if (!ok) problems.push({ field, message });
  };
  if (nameOnlyTypes.includes(draft.type)) {
    need(draft.title.en || draft.title.hi, "title.en", "A name is required");
  } else {
    need(draft.title.hi, "title.hi", "Hindi title is required");
    need(draft.title.en, "title.en", "English title is required");
  }
  if (descriptionRequiredTypes.includes(draft.type)) {
    need(
      draft.description.hi,
      "description.hi",
      "Hindi description is required",
    );
    need(
      draft.description.en,
      "description.en",
      "English description is required",
    );
  }
  need(draft.deityIds.length, "deityIds", "At least one deity is required");
  for (const variant of requiredVariants(draft.type))
    need(
      draft.media[variant],
      `media.${variant}`,
      `${draft.type} needs a "${variant}" media key`,
    );
  return problems;
}

// ---- Banners (doc 09 §7, doc 06 §3).
// INTERNAL targets only (D-015), restricted to routes the app resolves today
// (src/app/navigation/routes.ts). The CMS never accepts a free-text URL.
export const bannerRoutes = ["mandir", "sadhana", "explore"] as const;
export const bannerInputSchema = z
  .object({
    title: localized(80).refine(bothLanguages, "both languages are required"),
    subtitle: localized(140),
    ctaText: localized(40).refine(bothLanguages, "both languages are required"),
    image: z
      .object({
        mobile: mediaVariantSchema,
        thumb: mediaVariantSchema.optional(),
      })
      .strict(),
    target: z.object({ route: z.enum(bannerRoutes) }).strict(),
    priority: z.number().int().min(0).max(1000),
    startAt: isoInstantSchema,
    endAt: isoInstantSchema,
    isActive: z.boolean(),
    languages: z
      .array(z.enum(["hi", "en"]))
      .min(1)
      .refine((value) => new Set(value).size === value.length, {
        message: "duplicate language",
      }),
  })
  .strict()
  .refine((banner) => Date.parse(banner.endAt) > Date.parse(banner.startAt), {
    path: ["endAt"],
    message: "must be after the start",
  });
export type BannerInput = z.infer<typeof bannerInputSchema>;
export const createBannerSchema = z
  .object({ banner: bannerInputSchema })
  .strict();
export const updateBannerSchema = z
  .object({ id: z.string().min(1).max(128), banner: bannerInputSchema })
  .strict();
export const deleteBannerSchema = z
  .object({ id: z.string().min(1).max(128) })
  .strict();

// ---- Home manager (doc 09 §6). Each language has its own layout document;
// `expectedRevision` is the revision the editor loaded (0 when none exists),
// so two open editors cannot silently overwrite each other.
const homeLanguage = z.enum(homeLanguages);
export const getHomeLayoutSchema = z
  .object({ language: homeLanguage })
  .strict();
export const updateHomeLayoutSchema = z
  .object({
    language: homeLanguage,
    sections: homeLayoutSectionsSchema,
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export type UpdateHomeLayoutInput = z.input<typeof updateHomeLayoutSchema>;
export const previewHomeFeedSchema = z
  .object({ language: homeLanguage, sections: homeLayoutSectionsSchema })
  .strict();
export const rebuildHomeFeedSchema = z.object({}).strict().nullish();

// ---- Admin roles and uploads.
export const setAdminRoleSchema = z
  .object({
    email: z.email().max(320),
    role: z.enum(adminRoles).nullable(),
  })
  .strict();

// Originals accepted into staging/ before processMedia (doc 22 §A4).
export const uploadKinds = {
  "image/png": { ext: "png", maxBytes: 40 * 1024 * 1024 },
  "image/jpeg": { ext: "jpg", maxBytes: 40 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 40 * 1024 * 1024 },
  "audio/mpeg": { ext: "mp3", maxBytes: 200 * 1024 * 1024 },
  "audio/wav": { ext: "wav", maxBytes: 200 * 1024 * 1024 },
  "audio/aac": { ext: "aac", maxBytes: 200 * 1024 * 1024 },
  "audio/mp4": { ext: "m4a", maxBytes: 200 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", maxBytes: 300 * 1024 * 1024 },
} as const;
export type UploadMime = keyof typeof uploadKinds;
export const requestUploadSchema = z
  .object({
    contentId: slugSchema,
    contentType: z.enum(
      Object.keys(uploadKinds) as [UploadMime, ...UploadMime[]],
    ),
    bytes: z.number().int().positive(),
  })
  .strict()
  .refine((input) => input.bytes <= uploadKinds[input.contentType].maxBytes, {
    path: ["bytes"],
    message: "file is too large for its type",
  });

// Details attached to failed-precondition errors so the CMS can show exactly
// what blocks a transition.
// CHECKLIST_INCOMPLETE is a legacy name kept for existing clients: it now
// means "required fields are missing" (see readinessProblems).
export type TransitionErrorDetails = {
  reason: "CHECKLIST_INCOMPLETE" | "INVALID_TRANSITION" | "SCHEDULE_REQUIRED";
  problems?: ReadinessProblem[];
};

const toIso = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "toMillis" in value &&
  typeof value.toMillis === "function"
    ? new Date(value.toMillis() as number).toISOString()
    : undefined;
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

// Rebuilds the editable draft from the stored content and contentPrivate
// documents (either Firebase SDK). Imported or seeded items may predate some
// fields, so absent lists and flags take the importer's defaults. The result
// is unvalidated input: parse it with contentDraftSchema.
export function draftFromDocuments(
  content: Record<string, unknown>,
  privateRecord: Record<string, unknown> | undefined,
): ContentDraftInput {
  const type = content.type as ContentType;
  const stored = privateRecord ?? {};
  const checks = record(stored.checklist);
  return {
    type,
    title: (content.title as ContentDraft["title"]) ?? { hi: "", en: "" },
    description: (content.description as ContentDraft["description"]) ?? {
      hi: "",
      en: "",
    },
    audioLanguage: content.audioLanguage as string | undefined,
    deityIds: (content.deityIds as string[]) ?? [],
    categoryIds: (content.categoryIds as string[]) ?? [],
    tags: (content.tags as string[]) ?? [],
    media: (content.media as DraftMedia) ?? {},
    durationSeconds: content.durationSeconds as number | undefined,
    isFeatured: (content.isFeatured as boolean) ?? false,
    saveGate:
      (content.saveGate as "REWARDED" | "FREE") ?? defaultSaveGate(type),
    isShareable: (content.isShareable as boolean) ?? true,
    adEligible: (content.adEligible as boolean) ?? true,
    expireAt: toIso(content.expireAt),
    private: {
      sourceText: stored.sourceText as string | undefined,
      sourceTextRef: stored.sourceTextRef as string | undefined,
      aiTool: stored.aiTool as string | undefined,
      aiPlan: stored.aiPlan as string | undefined,
      licenseRecordId: stored.licenseRecordId as string | undefined,
      checklist: Object.fromEntries(
        checkItems
          .filter((item) => typeof checks[item] === "boolean")
          .map((item) => [item, checks[item] as boolean]),
      ),
    },
  };
}
