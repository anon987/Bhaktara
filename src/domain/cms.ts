import { z } from "zod";
import { contentTypes, ContentType } from "./models";
import {
  mediaVariantNames,
  mediaVariantSchema,
  MediaVariantName,
} from "./media";
import {
  checkItems,
  checkLabels,
  checklistState,
  sacredTypes,
} from "./checklist";

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
  "audit.read": ["SUPER_ADMIN", "CONTENT_ADMIN"],
  "role.write": ["SUPER_ADMIN"],
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
// Entering these states needs a complete checklist and required fields.
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

export const contentPrivateInputSchema = z
  .object({
    sourceText: optionalText(20000),
    sourceTextRef: optionalText(300),
    aiTool: optionalText(100),
    aiPlan: optionalText(100),
    licenseRecordId: optionalText(100),
    checklist: z.partialRecord(z.enum(checkItems), z.boolean()),
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

export const saveContentSchema = z
  .object({ id: slugSchema, draft: contentDraftSchema })
  .strict();
export const transitionSchema = z
  .object({
    contentId: slugSchema,
    to: z.enum(contentStatuses),
    scheduledAt: isoInstantSchema.optional(),
  })
  .strict();
export type TransitionInput = z.infer<typeof transitionSchema>;

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

// Everything that blocks DRAFT → READY (doc 09 §3, doc 12 §3–§5). The editor
// shows the same list that transitionContentStatus returns.
export function readinessProblems(draft: ContentDraft): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  const need = (ok: unknown, field: string, message: string) => {
    if (!ok) problems.push({ field, message });
  };
  need(draft.title.hi, "title.hi", "Hindi title is required");
  need(draft.title.en, "title.en", "English title is required");
  need(draft.description.hi, "description.hi", "Hindi description is required");
  need(
    draft.description.en,
    "description.en",
    "English description is required",
  );
  need(draft.deityIds.length, "deityIds", "At least one deity is required");
  for (const variant of requiredVariants(draft.type))
    need(
      draft.media[variant],
      `media.${variant}`,
      `${draft.type} needs a "${variant}" media key`,
    );
  need(draft.private.aiTool, "private.aiTool", "AI tool must be recorded");
  need(draft.private.aiPlan, "private.aiPlan", "AI plan must be recorded");
  if (sacredTypes.includes(draft.type)) {
    need(
      draft.private.sourceText,
      "private.sourceText",
      "Sacred text audio needs the canonical source text",
    );
    need(
      draft.private.sourceTextRef,
      "private.sourceTextRef",
      "Sacred text audio needs a source reference",
    );
  }
  for (const item of checklistState(draft.type, draft.private.checklist)
    .missing)
    problems.push({
      field: `checklist.${item}`,
      message: `Checklist: ${checkLabels[item]}`,
    });
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
