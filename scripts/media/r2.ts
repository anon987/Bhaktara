import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Operator-only R2 access (doc 22 §A4). Credentials come from the environment
// (normally .env.r2, which is Git-ignored) and are never printed or bundled.
// They must not use the EXPO_PUBLIC_ prefix, which would inline them into the app.
const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;
export const IMMUTABLE = "public, max-age=31536000, immutable";

export function r2FromEnv(confirmBucket?: string) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`Missing ${missing.join(", ")}. See docs/MEDIA_R2.md.`);
  const bucket = process.env.R2_BUCKET!;
  // Dev is the default target (doc 23). Other buckets need the name repeated.
  if (!bucket.endsWith("-dev") && confirmBucket !== bucket)
    throw new Error(
      `Refusing to write to non-dev bucket "${bucket}" without --confirm-bucket ${bucket}`,
    );
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return {
    bucket,
    // Keys are content-addressed: an existing object with the same key and
    // size already holds these bytes, so it is never overwritten.
    async putImmutable(key: string, body: Buffer, contentType: string) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (head.ContentLength === body.length) return "exists" as const;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status !== 404) throw error;
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMMUTABLE,
        }),
      );
      return "uploaded" as const;
    },
  };
}
