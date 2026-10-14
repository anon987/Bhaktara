import { z } from "zod";
import { assetKeySchema } from "./media";

// The devotee's own profile and account (doc 21): their name, their photo,
// and joining a guest's progress to a Google account. Shared by the Cloud
// Functions (which enforce it) and the app (which validates forms with it).

// Names as people write them in Hindi or English: letters (any script),
// marks, spaces and a few joiners; 2–30 characters after trimming. The
// server also applies the profanity filter (D-042).
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;
export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN)
  .max(DISPLAY_NAME_MAX)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u, "letters only");

// A profile photo is stored as an asset key (D-031: keys, never URLs) under
// users/{uid}/photo.{hash}.{ext}; the app shows it through the media CDN.
export const PROFILE_PHOTO_MAX_BYTES = 1024 * 1024;
export const profilePhotoTypes = ["image/jpeg", "image/webp"] as const;
export type ProfilePhotoType = (typeof profilePhotoTypes)[number];

// ---- Callables ----------------------------------------------------------------

// updateProfile: change the name, the photo, or both. photoKey null removes
// the photo; a key must be one handed out by requestProfilePhotoUpload for
// this user and already uploaded.
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    photoKey: assetKeySchema.nullable().optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.photoKey !== undefined, {
    message: "nothing to change",
  });
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ProfileResult = {
  displayName: string | null;
  photoKey: string | null;
};

// requestProfilePhotoUpload: a short-lived signed PUT URL for the photo (the
// app resizes it to at most 512 px first). The app PUTs the bytes with the
// given headers, then calls updateProfile({ photoKey: key }).
export const requestProfilePhotoUploadSchema = z
  .object({
    contentType: z.enum(profilePhotoTypes),
    bytes: z.number().int().positive().max(PROFILE_PHOTO_MAX_BYTES),
  })
  .strict();
export type ProfilePhotoUpload = {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};

// mergeGuestAccount (doc 21 §3–4): called while signed in to the Google
// account, with the guest's ID token captured before switching. Idempotent
// per guest (accountMerges/{guestUid}).
export const mergeGuestAccountSchema = z
  .object({ guestIdToken: z.string().min(20).max(8192) })
  .strict();
export type MergeSummary = {
  // True when this guest had already been merged (the stored result).
  alreadyMerged: boolean;
  xpAdded: number;
  badgesAdded: number;
  favoritesAdded: number;
  daysAdded: number;
};
