// The devotee's own profile (doc 21, D-042): display name and photo. Both are
// written only here (rules deny the owner), so every name passes the filter
// and every photo key is one this user uploaded through
// requestProfilePhotoUpload. Guests may use both (D-016).
import { randomBytes } from "node:crypto";
import {
  DocumentReference,
  DocumentSnapshot,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  PROFILE_PHOTO_MAX_BYTES,
  ProfilePhotoType,
  ProfilePhotoUpload,
  profilePhotoTypes,
  ProfileResult,
  requestProfilePhotoUploadSchema,
  updateProfileSchema,
} from "../../src/domain/account";
import { bhaktiDayAt } from "../../src/domain/progression";
import { db, parse, writeAudit } from "./core";
import { isNameBlocked } from "./profanity";
import { newProfile, Player, storedTimezone } from "./progression";
import { Presign, r2Client, R2Config, r2ConfigFromEnv, s3Presigner } from "./uploads";

export const PHOTO_UPLOAD_TTL_SECONDS = 600;
// Per practice day (04:00 local boundary), counted on users/{uid}.profileLimits.
export const NAME_CHANGES_PER_DAY = 5;
export const PHOTO_UPLOADS_PER_DAY = 10;
// Keys are random per upload, so a new photo is a new URL and can be cached
// for good by the CDN and the app.
export const PHOTO_CACHE_CONTROL = "public, max-age=31536000, immutable";

const photoExt: Record<ProfilePhotoType, "jpg" | "webp"> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ProfileErrorReason =
  | "DISPLAY_NAME_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "PHOTO_KEY_INVALID"
  | "PHOTO_NOT_UPLOADED"
  | "PHOTO_TOO_LARGE"
  | "PHOTO_TYPE_INVALID"
  | "UPLOADS_NOT_CONFIGURED";

export function profileError(reason: ProfileErrorReason, message: string) {
  const code =
    reason === "RATE_LIMITED"
      ? "resource-exhausted"
      : reason === "PHOTO_NOT_UPLOADED" || reason === "UPLOADS_NOT_CONFIGURED"
        ? "failed-precondition"
        : "invalid-argument";
  return new HttpsError(code, message, { reason });
}

// ---- Names ---------------------------------------------------------------------

// The schema has trimmed and checked the characters; runs of whitespace
// (tabs, new lines) become one space and the text is NFC, so equal-looking
// names are stored alike.
export function normalizeDisplayName(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function checkDisplayName(name: string): string {
  const normalized = normalizeDisplayName(name);
  if (isNameBlocked(normalized))
    throw profileError(
      "DISPLAY_NAME_NOT_ALLOWED",
      "This name is not allowed. Please choose another.",
    );
  return normalized;
}

// ---- Photo keys and the R2 store ----------------------------------------------

export const profilePhotoPrefix = (uid: string) => `users/${uid}/photo.`;

export function profilePhotoKey(uid: string, contentType: ProfilePhotoType, id: string) {
  return `${profilePhotoPrefix(uid)}${id}.${photoExt[contentType]}`;
}

// The extension a key handed out to this user carries, or null when the key
// is not one of theirs (another user's, another folder, a made-up name).
export function photoKeyExt(uid: string, key: string): "jpg" | "webp" | null {
  const prefix = profilePhotoPrefix(uid);
  if (!key.startsWith(prefix)) return null;
  const match = /^([0-9a-f]{16})\.(jpg|webp)$/.exec(key.slice(prefix.length));
  return match ? (match[2] as "jpg" | "webp") : null;
}

// What the first bytes say the image is.
export function sniffImage(bytes: Uint8Array): ProfilePhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return "image/webp";
  return null;
}

// The few R2 operations the profile needs; a fake in unit tests.
export type PhotoStore = {
  head(key: string): Promise<{ bytes: number; contentType: string | null } | null>;
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
};

const httpStatus = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

export function r2PhotoStore(config: R2Config): PhotoStore {
  const client = r2Client(config);
  const s3 = () => import("@aws-sdk/client-s3");
  return {
    async head(key) {
      const { HeadObjectCommand } = await s3();
      try {
        const result = await (await client).send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return {
          bytes: result.ContentLength ?? 0,
          contentType: result.ContentType ?? null,
        };
      } catch (error) {
        if (httpStatus(error) === 404) return null;
        throw error;
      }
    },
    async readStart(key, bytes) {
      const { GetObjectCommand } = await s3();
      const result = await (await client).send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      return (await result.Body?.transformToByteArray()) ?? new Uint8Array();
    },
    async remove(key) {
      const { DeleteObjectCommand } = await s3();
      await (await client).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

export function photoStoreFromEnv(env: NodeJS.ProcessEnv = process.env): PhotoStore | null {
  const config = r2ConfigFromEnv(env);
  return config && r2PhotoStore(config);
}

// The photo must be this user's key, uploaded, at most 1 MB, and a JPEG or
// WebP both by its stored type and by its first bytes.
export async function verifyPhotoUpload(
  uid: string,
  key: string,
  store: PhotoStore | null,
): Promise<{ bytes: number; contentType: ProfilePhotoType }> {
  const ext = photoKeyExt(uid, key);
  if (!ext)
    throw profileError("PHOTO_KEY_INVALID", "This photo does not belong to your profile.");
  if (!store)
    throw profileError(
      "UPLOADS_NOT_CONFIGURED",
      "Photo uploads are not configured for this environment.",
    );
  const head = await store.head(key);
  if (!head)
    throw profileError("PHOTO_NOT_UPLOADED", "The photo was not found. Please upload it again.");
  if (head.bytes <= 0 || head.bytes > PROFILE_PHOTO_MAX_BYTES)
    throw profileError("PHOTO_TOO_LARGE", "A profile photo must be at most 1 MB.");
  const expected = profilePhotoTypes.find((type) => photoExt[type] === ext)!;
  const sniffed = sniffImage(await store.readStart(key, 12));
  if (head.contentType?.split(";")[0].trim().toLowerCase() !== expected || sniffed !== expected)
    throw profileError("PHOTO_TYPE_INVALID", "A profile photo must be a JPEG or WebP image.");
  return { bytes: head.bytes, contentType: expected };
}

// ---- Daily limits ----------------------------------------------------------------

type ProfileLimits = { day: string; nameChanges: number; photoUploads: number };

function limitsFor(user: DocumentSnapshot, day: string): ProfileLimits {
  const raw = user.get("profileLimits") as Partial<ProfileLimits> | undefined;
  return raw?.day === day
    ? {
        day,
        nameChanges: Number(raw.nameChanges ?? 0),
        photoUploads: Number(raw.photoUploads ?? 0),
      }
    : { day, nameChanges: 0, photoUploads: 0 };
}

// ---- Denormalized copies (D-042) ----------------------------------------------------

// League board rows carry the name and photo (doc 06 leagueMembers). Only rows
// of weeks still running (no `result` yet) follow a change; finished weeks
// keep the name they were played under. Reads run inside the transaction, so
// call this before any write.
export async function openLeagueRows(
  tx: Transaction,
  uid: string,
): Promise<DocumentReference[]> {
  const rows = await tx.get(
    db().collection("leagueMembers").where("uid", "==", uid).limit(20),
  );
  return rows.docs.filter((row) => row.get("result") == null).map((row) => row.ref);
}

// ---- updateProfile ------------------------------------------------------------------

export async function updateProfile(
  player: Player,
  data: unknown,
  deps: { store?: PhotoStore | null } = {},
): Promise<ProfileResult> {
  const input = parse(updateProfileSchema, data);
  const displayName =
    input.displayName === undefined ? undefined : checkDisplayName(input.displayName);
  const store = deps.store === undefined ? photoStoreFromEnv() : deps.store;
  if (typeof input.photoKey === "string")
    await verifyPhotoUpload(player.uid, input.photoKey, store);

  const ref = db().collection("users").doc(player.uid);
  const now = Timestamp.now();
  const outcome = await db().runTransaction(async (tx) => {
    const user = await tx.get(ref);
    const before: ProfileResult = {
      displayName: (user.get("displayName") as string | null | undefined) ?? null,
      photoKey: (user.get("photoKey") as string | null | undefined) ?? null,
    };
    const after: ProfileResult = {
      displayName: displayName ?? before.displayName,
      photoKey: input.photoKey === undefined ? before.photoKey : input.photoKey,
    };
    const nameChanged = after.displayName !== before.displayName;
    const photoChanged = after.photoKey !== before.photoKey;
    if (!nameChanged && !photoChanged) return { before, after };

    const timezone = storedTimezone(user);
    const limits = limitsFor(user, bhaktiDayAt(now.toDate(), timezone));
    if (nameChanged) {
      if (limits.nameChanges >= NAME_CHANGES_PER_DAY)
        throw profileError(
          "RATE_LIMITED",
          "You have changed your name too often today. Try again tomorrow.",
        );
      limits.nameChanges += 1;
    }
    const leagueRows = await openLeagueRows(tx, player.uid);

    const fields = {
      displayName: after.displayName,
      photoKey: after.photoKey,
      profileLimits: limits,
      lastActiveAt: now,
    };
    if (user.exists) tx.update(ref, fields);
    else tx.create(ref, { ...newProfile(player, timezone, "hi", now), ...fields });
    for (const row of leagueRows)
      tx.update(row, { displayName: after.displayName, photoKey: after.photoKey });
    // Self-service change: the acting uid is the user's own.
    writeAudit(
      tx,
      { uid: player.uid, role: "SYSTEM" },
      {
        action: "profile.update",
        entity: "user",
        entityId: player.uid,
        beforeSummary: before,
        afterSummary: { ...after, leagueRows: leagueRows.length },
      },
    );
    return { before, after };
  });

  // The replaced photo is no longer referenced. Best effort: an object left
  // behind is only storage.
  const old = outcome.before.photoKey;
  if (old && old !== outcome.after.photoKey && photoKeyExt(player.uid, old) && store)
    await store.remove(old).catch((error: unknown) =>
      logger.warn("Could not delete the old profile photo", {
        uid: player.uid,
        error: String(error),
      }),
    );
  return outcome.after;
}

// ---- requestProfilePhotoUpload -----------------------------------------------------------

export async function buildPhotoUploadSlot(
  uid: string,
  input: { contentType: ProfilePhotoType; bytes: number },
  deps: { presign: Presign; bucket: string; now: Date; id?: string },
): Promise<ProfilePhotoUpload> {
  const key = profilePhotoKey(uid, input.contentType, deps.id ?? randomBytes(8).toString("hex"));
  const uploadUrl = await deps.presign({
    bucket: deps.bucket,
    key,
    contentType: input.contentType,
    bytes: input.bytes,
    expiresIn: PHOTO_UPLOAD_TTL_SECONDS,
    cacheControl: PHOTO_CACHE_CONTROL,
  });
  return {
    key,
    uploadUrl,
    // Content-Length is signed too; HTTP clients set it from the body, which
    // must be exactly `bytes` long.
    headers: { "Content-Type": input.contentType, "Cache-Control": PHOTO_CACHE_CONTROL },
    expiresAt: new Date(deps.now.getTime() + PHOTO_UPLOAD_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function requestProfilePhotoUpload(
  player: Player,
  data: unknown,
  env: NodeJS.ProcessEnv = process.env,
  presign?: Presign,
): Promise<ProfilePhotoUpload> {
  const input = parse(requestProfilePhotoUploadSchema, data);
  const config = r2ConfigFromEnv(env);
  if (!config)
    throw profileError(
      "UPLOADS_NOT_CONFIGURED",
      "Photo uploads are not configured for this environment.",
    );
  const ref = db().collection("users").doc(player.uid);
  const now = Timestamp.now();
  await db().runTransaction(async (tx) => {
    const user = await tx.get(ref);
    const timezone = storedTimezone(user);
    const limits = limitsFor(user, bhaktiDayAt(now.toDate(), timezone));
    if (limits.photoUploads >= PHOTO_UPLOADS_PER_DAY)
      throw profileError(
        "RATE_LIMITED",
        "You have uploaded too many photos today. Try again tomorrow.",
      );
    limits.photoUploads += 1;
    if (user.exists) tx.update(ref, { profileLimits: limits });
    else tx.create(ref, { ...newProfile(player, timezone, "hi", now), profileLimits: limits });
  });
  return buildPhotoUploadSlot(player.uid, input, {
    presign: presign ?? s3Presigner(config),
    bucket: config.bucket,
    now: now.toDate(),
  });
}
