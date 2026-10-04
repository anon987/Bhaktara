import { z } from "zod";

// Media is stored as asset keys, never URLs (D-031, doc 22 §A2). The client
// joins a key to the configured CDN base: url = mediaBaseUrl + "/" + key.
export const assetKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.includes(":") &&
      !value.includes("\\") &&
      !value.includes("?") &&
      !value.includes("#") &&
      !value.startsWith("/") &&
      !value.split("/").some((part) => part === "" || part === ".."),
    "Media must use asset keys",
  );

// Doc 06: MediaVariant { key, bytes, mime, width?, height?, durationSeconds?, bitrate? }.
// Metadata is optional on read so bundled placeholder art (key only) still parses.
export const mediaVariantSchema = z.object({
  key: assetKeySchema,
  bytes: z.number().int().positive().optional(),
  mime: z.string().min(3).max(100).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  bitrate: z.number().int().positive().optional(),
});
export type MediaVariant = z.infer<typeof mediaVariantSchema>;
export const mediaVariantNames = [
  "thumb",
  "mobile",
  "full",
  "stream",
  "file",
  "video720",
  "poster",
] as const;
export type MediaVariantName = (typeof mediaVariantNames)[number];
export const mediaSchema = z.object({
  thumb: mediaVariantSchema,
  mobile: mediaVariantSchema.optional(),
  full: mediaVariantSchema.optional(),
  stream: mediaVariantSchema.optional(),
  file: mediaVariantSchema.optional(),
  video720: mediaVariantSchema.optional(),
  poster: mediaVariantSchema.optional(),
});
export type Media = z.infer<typeof mediaSchema>;

// Locally drawn symbolic art; never fetched from the CDN.
export const isPlaceholderKey = (key: string) => key.startsWith("placeholder/");

export function mediaUrl(baseUrl: string | null, key: string): string | null {
  if (
    !baseUrl ||
    isPlaceholderKey(key) ||
    !assetKeySchema.safeParse(key).success
  )
    return null;
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// The CDN base must be a bare origin (plus optional path) without credentials,
// query or fragment. Plain HTTP is accepted only for local testing hosts.
export function parseMediaBaseUrl(value?: string): string | null {
  if (!value) return null;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("Media base URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Media base URL must not contain credentials, query or hash",
    );
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

// Content-addressed, immutable keys (doc 22 §A2): {type}/{id}/{variant}.{hash8}.{ext}
// A changed file produces a new key, so CDN caches never need purging.
const segment = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export function buildMediaKey(input: {
  type: string;
  id: string;
  variant: MediaVariantName;
  hash: string;
  ext: string;
}): string {
  const type = input.type.toLowerCase();
  if (!segment.test(type) || !segment.test(input.id))
    throw new Error("Media type and ID must be lowercase slugs");
  if (!/^[0-9a-f]{8,}$/.test(input.hash) || !/^[a-z0-9]{2,5}$/.test(input.ext))
    throw new Error("Invalid media hash or extension");
  return `${type}/${input.id}/${input.variant}.${input.hash.slice(0, 8)}.${input.ext}`;
}
