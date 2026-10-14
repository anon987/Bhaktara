import { z } from "zod";
import { isoInstantSchema, slugSchema } from "./cms";
import { mediaVariantSchema } from "./media";
import { contentTypes } from "./models";
import {
  badgeSchema,
  challengeSchema,
  gamificationConfigSchema,
  sadhanaConfigSchema,
} from "./progression";
import { bhogKinds, flowerKinds, garlandKinds } from "./puja";
import { visualsConfigSchema } from "./visuals";

// Admin panel v2 (doc 09 §1): catalogue documents, versioned app config,
// user administration and the asset library. Shared by the Cloud Functions
// (which enforce it) and the admin web app (which validates forms with it).

const text = (max: number) => z.string().trim().max(max);
const localizedText = (max: number) =>
  z.object({ hi: text(max), en: text(max) });
const requiredLocalized = (max: number) =>
  z.object({ hi: text(max).min(1), en: text(max).min(1) });
const art = z.object({
  mobile: mediaVariantSchema,
  thumb: mediaVariantSchema.optional(),
});
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ids = (max: number) => z.array(slugSchema).max(max);

// ---- Catalogue kinds ------------------------------------------------------

export const deityInputSchema = z
  .object({
    name: requiredLocalized(60),
    description: localizedText(400),
    aliases: z.array(text(40).min(1)).max(20),
    isActive: z.boolean(),
    isMandirEnabled: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
    mandirArt: art.optional(),
    // D-057: the temple with the deity for the Prayer screen, and the
    // symbol above the mantra on the Jaap screen (Krishna's flute…).
    shrineArt: art.optional(),
    jaapEmblem: art.optional(),
    // The deity alone on a transparent background (a cut-out PNG), stood in
    // the sanctum of whichever temple the devotee swipes to.
    murtiArt: art.optional(),
  })
  .strict();

export const categoryInputSchema = z
  .object({
    name: requiredLocalized(60),
    description: localizedText(300),
    contentTypes: z.array(z.enum(contentTypes)).max(contentTypes.length),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
  })
  .strict();

export const collectionInputSchema = z
  .object({
    title: requiredLocalized(80),
    description: localizedText(400),
    cover: z.object({ thumb: mediaVariantSchema }).optional(),
    itemIds: ids(200),
    isFeatured: z.boolean(),
    isPublished: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
  })
  .strict();

export const challengeInputSchema = challengeSchema
  .extend({ startAt: isoInstantSchema, endAt: isoInstantSchema })
  .strict()
  .refine((value) => value.startAt < value.endAt, {
    path: ["endAt"],
    message: "must be after the start",
  });

export const badgeInputSchema = badgeSchema.strict();

export const festivalInputSchema = z
  .object({
    name: requiredLocalized(80),
    description: localizedText(600),
    date: dayString,
    endDate: dayString.optional(),
    image: art.optional(),
    deityIds: ids(20),
    collectionId: slugSchema.optional(),
    isFeatured: z.boolean(),
    isPublished: z.boolean(),
  })
  .strict()
  .refine((value) => !value.endDate || value.endDate >= value.date, {
    path: ["endDate"],
    message: "must not be before the date",
  });

export const offeringKinds = [
  "flower",
  "garland",
  "diya",
  "ornament",
  "bhog",
  "other",
  // Mandir decor: the temple the deity stands in (swiped on the Prayer
  // screen), decorative lights over it, and the bell rung with its sound.
  "temple",
  "light",
  "bell",
] as const;
export type OfferingKind = (typeof offeringKinds)[number];
// FREE: always available. REWARDED: one rewarded ad unlocks it for good on
// that device. REWARDED_SINGLE_USE: one rewarded ad per use.
export const offeringUnlocks = [
  "FREE",
  "REWARDED",
  "REWARDED_SINGLE_USE",
] as const;
export type OfferingUnlock = (typeof offeringUnlocks)[number];
const unit = z.number().min(0).max(1);
// Where the deity stands in a temple image, as fractions of its width and
// height: the box the murti is fitted into, feet on its bottom edge.
export const templeStageSchema = z
  .object({ x: unit, y: unit, width: unit, height: unit })
  .strict()
  .refine((s) => s.x + s.width <= 1 && s.y + s.height <= 1, {
    message: "must fit inside the image",
  });
export type TempleStage = z.infer<typeof templeStageSchema>;
export const mandirOfferingInputSchema = z
  .object({
    name: requiredLocalized(60),
    kind: z.enum(offeringKinds),
    art: art.optional(),
    // Flowers: which traditional flower it is, so the deity rules (what is
    // offered to whom, what never is) apply to it.
    flowerKind: z.enum(flowerKinds).optional(),
    // Bells: the sound when rung (an audio asset).
    sound: z.object({ audio: mediaVariantSchema }).optional(),
    // Lights: where it hangs over the temple.
    placement: z.enum(["top", "bottom", "sides"]).optional(),
    // Temples: where the deity stands in the image.
    stage: templeStageSchema.optional(),
    // Empty: offered to every deity.
    deityIds: ids(40),
    unlock: z.enum(offeringUnlocks),
    startAt: isoInstantSchema.optional(),
    endAt: isoInstantSchema.optional(),
    sortOrder: z.number().int().min(0).max(10000),
    isActive: z.boolean(),
  })
  .strict();

export const catalogKinds = {
  deity: { collection: "deities", schema: deityInputSchema },
  category: { collection: "categories", schema: categoryInputSchema },
  collection: { collection: "collections", schema: collectionInputSchema },
  challenge: { collection: "challenges", schema: challengeInputSchema },
  badge: { collection: "badges", schema: badgeInputSchema },
  festival: { collection: "festivals", schema: festivalInputSchema },
  mandirOffering: {
    collection: "mandirOfferings",
    schema: mandirOfferingInputSchema,
  },
} as const;
export type CatalogKind = keyof typeof catalogKinds;
export const catalogKindNames = Object.keys(catalogKinds) as CatalogKind[];

export const saveCatalogItemSchema = z
  .object({
    kind: z.enum(catalogKindNames as [CatalogKind, ...CatalogKind[]]),
    // Omitted: a new document with a generated ID (or the given slug).
    id: slugSchema.optional(),
    create: z.boolean(),
    data: z.unknown(),
  })
  .strict();
export const deleteCatalogItemSchema = z
  .object({
    kind: z.enum(catalogKindNames as [CatalogKind, ...CatalogKind[]]),
    id: slugSchema,
  })
  .strict();

// ---- Puja offerings per deity (D-054), editable without an app release ----

export const deityOfferingsSchema = z
  .object({
    flowers: z.array(z.enum(flowerKinds)).min(1).max(flowerKinds.length),
    garland: z.enum(garlandKinds),
    bhog: z.array(z.enum(bhogKinds)).min(1).max(bhogKinds.length),
    tilak: z.enum(["tripundra", "urdhvaPundra", "bindu"]),
    tulsiOnBhog: z.boolean(),
  })
  .strict();
export const pujaConfigSchema = z
  .object({
    version: z.number().int().positive(),
    general: deityOfferingsSchema,
    deities: z.record(slugSchema, deityOfferingsSchema),
  })
  .strict();
export type PujaConfig = z.infer<typeof pujaConfigSchema>;

// ---- Versioned app config ---------------------------------------------------

export const configDocs = {
  gamification: gamificationConfigSchema,
  sadhana: sadhanaConfigSchema,
  puja: pujaConfigSchema,
  visuals: visualsConfigSchema,
} as const;
export type ConfigDoc = keyof typeof configDocs;
const configIds = Object.keys(configDocs) as [ConfigDoc, ...ConfigDoc[]];

export const saveConfigSchema = z
  .object({
    id: z.enum(configIds),
    data: z.unknown(),
    // The version the editor started from; a stale editor is refused.
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const rollbackConfigSchema = z
  .object({
    id: z.enum(configIds),
    toVersion: z.number().int().positive(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

// ---- Users -------------------------------------------------------------------

const uidSchema = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);
export const searchUsersSchema = z
  .object({
    query: z.string().trim().max(200).nullish(),
    filter: z.enum(["all", "flagged", "disabled", "signedIn", "guests"]),
    after: z.string().max(200).nullish(),
    pageSize: z.number().int().min(1).max(50),
  })
  .strict();
export const getUserSchema = z.object({ uid: uidSchema }).strict();
export const moderateUserSchema = z.discriminatedUnion("action", [
  z.object({
    uid: uidSchema,
    action: z.literal("flag"),
    reason: text(200).min(1),
  }),
  z.object({ uid: uidSchema, action: z.literal("unflag") }),
  z.object({ uid: uidSchema, action: z.literal("resetDisplayName") }),
  z.object({
    uid: uidSchema,
    action: z.literal("note"),
    note: text(1000).min(1),
  }),
]);
export const setUserDisabledSchema = z
  .object({ uid: uidSchema, disabled: z.boolean(), reason: text(200).min(1) })
  .strict();
// Deleting needs the UID typed again, as a deliberate confirmation.
export const deleteUserSchema = z
  .object({ uid: uidSchema, confirmUid: uidSchema, reason: text(200).min(1) })
  .strict()
  .refine((value) => value.uid === value.confirmUid, {
    path: ["confirmUid"],
    message: "must match the user ID",
  });

// ---- Asset library -----------------------------------------------------------

// What an uploaded image is for; it decides the renditions. Both keep the
// image's shape (and a PNG's transparency) at 1080 px wide; "deity" also
// makes a square thumbnail, "banner" a 320 px wide one. "sound" is audio (a
// bell's ring), stored exactly as uploaded with no renditions.
export const assetPurposes = [
  "banner",
  "deity",
  "festival",
  "offering",
  "collection",
  // D-057: Prayer and Jaap visuals.
  "temple",
  "background",
  "decor",
  // Mandir decor: bell sounds.
  "sound",
] as const;
export type AssetPurpose = (typeof assetPurposes)[number];
const tallArt: AssetPurpose[] = ["deity", "offering", "temple", "decor"];
export const assetMediaType = (purpose: AssetPurpose): "banner" | "deity" =>
  tallArt.includes(purpose) ? "deity" : "banner";
export const isAudioAsset = (purpose: AssetPurpose) => purpose === "sound";

export const assetImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
// Short sounds kept as uploaded: M4A (AAC) or MP3, at most 1 MB.
export const assetAudioTypes = ["audio/mp4", "audio/mpeg"] as const;
export const AUDIO_ASSET_MAX_BYTES = 1024 * 1024;
export type AssetContentType =
  | (typeof assetImageTypes)[number]
  | (typeof assetAudioTypes)[number];
const isAudioType = (type: string) =>
  (assetAudioTypes as readonly string[]).includes(type);

export const requestAssetUploadSchema = z
  .object({
    purpose: z.enum(assetPurposes),
    label: text(80).min(1),
    contentType: z.enum([...assetImageTypes, ...assetAudioTypes]),
    bytes: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (isAudioAsset(value.purpose) !== isAudioType(value.contentType))
      context.addIssue({
        code: "custom",
        path: ["contentType"],
        message: isAudioAsset(value.purpose)
          ? "a sound must be an M4A or MP3 file"
          : "must be a JPEG, PNG or WebP image",
      });
    if (isAudioType(value.contentType) && value.bytes > AUDIO_ASSET_MAX_BYTES)
      context.addIssue({
        code: "custom",
        path: ["bytes"],
        message: "a sound must be at most 1 MB",
      });
  });
// The uploaded original: `image` for pictures, `audio` for sounds.
export const processAssetSchema = z
  .object({
    assetId: slugSchema,
    image: z.string().min(1).max(200).optional(),
    audio: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => !!value.image !== !!value.audio, {
    message: "needs exactly one uploaded original (image or audio)",
  });
export const deleteAssetSchema = z.object({ assetId: slugSchema }).strict();
