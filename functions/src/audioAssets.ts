// Sound assets (bell rings for the Prayer screen) are short and already
// encoded, so they skip the media processor: the staged upload is checked
// (size, type, first bytes) and copied as-is to a content-addressed key.
import { randomBytes } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { AUDIO_ASSET_MAX_BYTES } from "../../src/domain/admin";
import { uploadKinds, UploadMime } from "../../src/domain/cms";
import { buildMediaKey, MediaVariant } from "../../src/domain/media";
import { r2Client, R2Config } from "./uploads";

export const IMMUTABLE = "public, max-age=31536000, immutable";

// The few R2 operations needed; a fake in unit tests.
export type AudioStore = {
  head(key: string): Promise<{ bytes: number; etag?: string } | null>;
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  copy(from: string, to: string, contentType: string): Promise<void>;
};

const httpStatus = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;

export function r2AudioStore(config: R2Config): AudioStore {
  const client = r2Client(config);
  const s3 = () => import("@aws-sdk/client-s3");
  return {
    async head(key) {
      const { HeadObjectCommand } = await s3();
      try {
        const result = await (await client).send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return { bytes: result.ContentLength ?? 0, etag: result.ETag };
      } catch (error) {
        if (httpStatus(error) === 404) return null;
        throw error;
      }
    },
    async readStart(key, bytes) {
      const { GetObjectCommand } = await s3();
      const result = await (await client).send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Range: `bytes=0-${bytes - 1}`,
        }),
      );
      return (await result.Body?.transformToByteArray()) ?? new Uint8Array();
    },
    async copy(from, to, contentType) {
      const { CopyObjectCommand } = await s3();
      await (await client).send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          Key: to,
          CopySource: `${config.bucket}/${from}`,
          ContentType: contentType,
          CacheControl: IMMUTABLE,
          MetadataDirective: "REPLACE",
        }),
      );
    },
  };
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));

// What the first bytes say the file is: an MP4/M4A container ("ftyp" box) or
// MP3 (an ID3 tag or an MPEG audio frame sync).
export function sniffAudio(bytes: Uint8Array): "audio/mp4" | "audio/mpeg" | null {
  if (bytes.length >= 8 && ascii(bytes, 4, 8) === "ftyp") return "audio/mp4";
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    return "audio/mpeg";
  return null;
}

// Copies a staged sound to sound/{assetId}/file.{hash}.{ext} and returns its
// variant. The hash is the upload's MD5 ETag when there is one.
export async function promoteAudio(input: {
  assetId: string;
  stagingKey: string;
  contentType: UploadMime;
  store: AudioStore;
}): Promise<MediaVariant> {
  const { store, stagingKey, contentType } = input;
  const ext = uploadKinds[contentType].ext;
  if (!stagingKey.endsWith(`.${ext}`))
    throw new HttpsError("invalid-argument", "That upload does not belong to this asset.");
  const head = await store.head(stagingKey);
  if (!head)
    throw new HttpsError("not-found", "The upload was not found. Upload the sound again.", {
      reason: "NOT_FOUND",
    });
  if (head.bytes <= 0 || head.bytes > AUDIO_ASSET_MAX_BYTES)
    throw new HttpsError("invalid-argument", "A sound must be at most 1 MB.", {
      reason: "TOO_LARGE",
    });
  const sniffed = sniffAudio(await store.readStart(stagingKey, 12));
  if (sniffed !== contentType)
    throw new HttpsError(
      "failed-precondition",
      contentType === "audio/mp4"
        ? "This file is not an M4A sound."
        : "This file is not an MP3 sound.",
      { reason: "INVALID_MEDIA" },
    );
  const etag = head.etag?.replace(/"/g, "").toLowerCase() ?? "";
  const hash = /^[0-9a-f]{8,}$/.test(etag) ? etag : randomBytes(4).toString("hex");
  const key = buildMediaKey({
    type: "sound",
    id: input.assetId,
    variant: "file",
    hash,
    ext,
  });
  await store.copy(stagingKey, key, contentType);
  return { key, bytes: head.bytes, mime: contentType };
}
