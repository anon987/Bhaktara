import { z } from "zod";
import { slugSchema, UploadMime, uploadKinds } from "./cms";
import { mediaVariantNames, mediaVariantSchema } from "./media";
import { ContentType } from "./models";

// Wire contract for processMedia (doc 22 §A4 step 4), shared by the callable
// (functions/src/media.ts), the Cloud Run processor (services/media-processor)
// and the admin web app. Pure: no Firebase or Node imports.

// Media processor types (doc 22 §A3). Content items map 1:1 by lower-casing;
// banner and deity art have no content document.
export const mediaTypes = [
  "bhajan",
  "aarti",
  "mantra",
  "chalisa",
  "ringtone",
  "wallpaper",
  "status",
  "banner",
  "deity",
] as const;
export type MediaType = (typeof mediaTypes)[number];
export const mediaTypeForContent = (type: ContentType): MediaType =>
  type.toLowerCase() as MediaType;

// Each original plays one role. Roles are derived from the staging upload
// kinds (cms.ts uploadKinds), so the extensions accepted here are exactly the
// ones requestUploadUrl can issue.
export const mediaInputRoles = ["audio", "image", "video"] as const;
export type MediaInputRole = (typeof mediaInputRoles)[number];
const roleOf = (mime: UploadMime) => mime.split("/")[0] as MediaInputRole;
export const inputExtensions = Object.fromEntries(
  mediaInputRoles.map((role) => [
    role,
    (Object.keys(uploadKinds) as UploadMime[])
      .filter((mime) => roleOf(mime) === role)
      .map((mime) => uploadKinds[mime].ext as string),
  ]),
) as Record<MediaInputRole, string[]>;

// Which originals each type takes (mirrors scripts/media/process.ts). At
// least one original is always needed. Audio items may arrive without a cover
// (it is taken from embedded album art when there is one, or added later),
// and a cover or poster alone replaces just that image on an existing item.
export const mediaInputRules: Record<
  MediaType,
  { required: MediaInputRole[]; optional: MediaInputRole[] }
> = {
  bhajan: { required: [], optional: ["audio", "image"] },
  aarti: { required: [], optional: ["audio", "image"] },
  mantra: { required: [], optional: ["audio", "image"] },
  chalisa: { required: [], optional: ["audio", "image"] },
  ringtone: { required: [], optional: ["audio", "image"] },
  wallpaper: { required: ["image"], optional: [] },
  // The poster comes from the image, or a frame one second into the video.
  status: { required: [], optional: ["video", "image"] },
  banner: { required: ["image"], optional: [] },
  deity: { required: ["image"], optional: [] },
};

// staging/{contentId}/{uuid}.{ext}, exactly as buildUploadSlot issues them.
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function isStagingKeyFor(
  contentId: string,
  role: MediaInputRole,
  key: string,
): boolean {
  const match = new RegExp(
    `^staging/([a-z0-9_-]+)/${uuid}\\.([a-z0-9]+)$`,
  ).exec(key);
  return (
    !!match &&
    match[1] === contentId &&
    inputExtensions[role].includes(match[2])
  );
}
// Size limit of a staging original, by extension (same as the upload slot).
export function stagingMaxBytes(key: string): number {
  const ext = key.slice(key.lastIndexOf(".") + 1);
  const kind = Object.values(uploadKinds).find((entry) => entry.ext === ext);
  if (!kind) throw new Error(`Unsupported staging extension .${ext}`);
  return kind.maxBytes;
}

const stagingKey = z.string().min(1).max(200);
export const mediaInputsSchema = z
  .object({ audio: stagingKey, image: stagingKey, video: stagingKey })
  .partial()
  .strict();
export type MediaInputs = z.infer<typeof mediaInputsSchema>;

function checkInputs(
  value: { contentId: string; inputs: MediaInputs },
  type: MediaType | undefined,
  context: z.RefinementCtx,
) {
  for (const role of mediaInputRoles) {
    const key = value.inputs[role];
    if (key !== undefined && !isStagingKeyFor(value.contentId, role, key))
      context.addIssue({
        code: "custom",
        path: ["inputs", role],
        message: `must be a staging/${value.contentId}/ upload of a supported ${role} type`,
      });
  }
  if (!mediaInputRoles.some((role) => value.inputs[role]))
    context.addIssue({
      code: "custom",
      path: ["inputs"],
      message: "at least one uploaded original is required",
    });
  if (!type) return;
  const rule = mediaInputRules[type];
  for (const role of rule.required)
    if (!value.inputs[role])
      context.addIssue({
        code: "custom",
        path: ["inputs", role],
        message: `${type} needs an uploaded ${role} file`,
      });
  for (const role of mediaInputRoles)
    if (
      value.inputs[role] &&
      !rule.required.includes(role) &&
      !rule.optional.includes(role)
    )
      context.addIssue({
        code: "custom",
        path: ["inputs", role],
        message: `${type} does not take ${role === "video" ? "a" : "an"} ${role} file`,
      });
}

// Callable input (admin web app → processMedia). The media type is taken from
// the stored content document, never from the request.
export const processMediaSchema = z
  .object({ contentId: slugSchema, inputs: mediaInputsSchema })
  .strict()
  .superRefine((value, context) => checkInputs(value, undefined, context));
export type ProcessMediaInput = z.infer<typeof processMediaSchema>;

// Callable → Cloud Run processor request (POST /v1/process).
export const processRequestSchema = z
  .object({
    contentId: slugSchema,
    type: z.enum(mediaTypes),
    inputs: mediaInputsSchema,
  })
  .strict()
  .superRefine((value, context) => checkInputs(value, value.type, context));
export type ProcessRequest = z.infer<typeof processRequestSchema>;

// Processor → callable response: the produced variants (doc 06 MediaVariant),
// for audio and video the playable duration (content.durationSeconds), and
// advisory warnings for the operator (e.g. a master below the recommended size).
// Only the variants this run produced; processMedia merges them into the item.
export const processedMediaSchema = z
  .partialRecord(z.enum(mediaVariantNames), mediaVariantSchema)
  .refine((media) => Object.keys(media).length > 0, "at least one variant is required");
export const processResponseSchema = z
  .object({
    media: processedMediaSchema,
    durationSeconds: z.number().positive().optional(),
    warnings: z.array(z.string().max(500)).max(20).optional(),
  })
  .strict();
export type ProcessResponse = z.infer<typeof processResponseSchema>;

// Error codes the processor returns as { error: { code, message } }.
export const processorErrorCodes = [
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TOO_LARGE",
  "INVALID_MEDIA",
  "INTERNAL",
] as const;
export type ProcessorErrorCode = (typeof processorErrorCodes)[number];
