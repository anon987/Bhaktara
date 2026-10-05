import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// R2 access for the operator scripts (doc 22 §A4) and the Cloud Run media
// processor. Credentials come from the environment (.env.r2 on the operator
// machine, Secret Manager on Cloud Run) and are never printed or bundled.
// They must not use the EXPO_PUBLIC_ prefix, which would inline them into the app.
const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;
export const IMMUTABLE = "public, max-age=31536000, immutable";

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// Names of the missing variables (never their values), or the config.
export function r2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { config: R2Config } | { missing: string[] } {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) return { missing };
  return {
    config: {
      accountId: env.R2_ACCOUNT_ID!,
      bucket: env.R2_BUCKET!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  };
}

export class ObjectTooLargeError extends Error {
  override name = "ObjectTooLargeError";
}

const httpStatus = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;

export type R2Bucket = ReturnType<typeof r2Bucket>;

export function r2Bucket(config: R2Config, client?: S3Client) {
  const s3 =
    client ??
    new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  const { bucket } = config;
  const head = async (key: string) => {
    try {
      const result = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return { bytes: result.ContentLength ?? 0 };
    } catch (error) {
      if (httpStatus(error) === 404) return null;
      throw error;
    }
  };
  return {
    bucket,
    head,
    // Keys are content-addressed: an existing object with the same key and
    // size already holds these bytes, so it is never overwritten.
    async putImmutable(key: string, body: Buffer, contentType: string) {
      if ((await head(key))?.bytes === body.length) return "exists" as const;
      await s3.send(
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
    // Small private bookkeeping objects (e.g. processor receipts).
    async putJson(key: string, value: unknown) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(value),
          ContentType: "application/json",
          CacheControl: "no-store",
        }),
      );
    },
    async getJson(key: string): Promise<unknown> {
      try {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        return JSON.parse((await result.Body?.transformToString()) ?? "null");
      } catch (error) {
        if (httpStatus(error) === 404) return null;
        throw error;
      }
    },
    // Streams an object to disk, aborting once it exceeds maxBytes.
    async download(key: string, path: string, maxBytes: number) {
      let result;
      try {
        result = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
      } catch (error) {
        if (httpStatus(error) === 404) return null;
        throw error;
      }
      if ((result.ContentLength ?? 0) > maxBytes)
        throw new ObjectTooLargeError(`${key} exceeds ${maxBytes} bytes`);
      let bytes = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > maxBytes
              ? new ObjectTooLargeError(`${key} exceeds ${maxBytes} bytes`)
              : null,
            chunk,
          );
        },
      });
      await pipeline(result.Body as Readable, limit, createWriteStream(path));
      return bytes;
    },
    async remove(key: string) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export function r2FromEnv(confirmBucket?: string) {
  const result = r2ConfigFromEnv();
  if ("missing" in result)
    throw new Error(
      `Missing ${result.missing.join(", ")}. See docs/MEDIA_R2.md.`,
    );
  const { bucket } = result.config;
  // Dev is the default target (doc 23). Other buckets need the name repeated.
  if (!bucket.endsWith("-dev") && confirmBucket !== bucket)
    throw new Error(
      `Refusing to write to non-dev bucket "${bucket}" without --confirm-bucket ${bucket}`,
    );
  return r2Bucket(result.config);
}
