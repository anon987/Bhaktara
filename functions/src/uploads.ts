import { randomUUID } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { requestUploadSchema, uploadKinds } from "../../src/domain/cms";
import { Actor, db, parse, requirePermission, writeAudit } from "./core";

// Doc 22 §A4 step 2: a short-lived presigned PUT for the staging/ prefix.
// processMedia (Cloud Run, pending) validates and promotes the original.
export const UPLOAD_TTL_SECONDS = 600;

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};
// Keys come from Secret Manager in production (bound in index.ts) and are
// exposed to the function as environment variables. Never logged or returned.
export function r2ConfigFromEnv(env: NodeJS.ProcessEnv): R2Config | null {
  const config = {
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
  return Object.values(config).every(Boolean) ? (config as R2Config) : null;
}

export type Presign = (input: {
  bucket: string;
  key: string;
  contentType: string;
  bytes: number;
  expiresIn: number;
  // Stored with the object and signed, so the uploader must send it as is.
  cacheControl?: string;
}) => Promise<string>;

// The AWS SDK is loaded on first use so the other functions start quickly.
// Path-style URLs keep the browser on the account endpoint host.
export async function r2Client(config: R2Config): Promise<S3Client> {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function s3Presigner(config: R2Config, client?: S3Client): Presign {
  return async (input) => {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(
      client ?? (await r2Client(config)),
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.bytes,
        CacheControl: input.cacheControl,
      }),
      {
        expiresIn: input.expiresIn,
        // The browser must send exactly the declared type and size.
        signableHeaders: new Set([
          "content-type",
          "content-length",
          ...(input.cacheControl ? ["cache-control"] : []),
        ]),
      },
    );
  };
}

export async function buildUploadSlot(
  input: z.infer<typeof requestUploadSchema>,
  deps: { presign: Presign; bucket: string; now: Date; id?: string },
) {
  const { ext } = uploadKinds[input.contentType];
  const key = `staging/${input.contentId}/${deps.id ?? randomUUID()}.${ext}`;
  const url = await deps.presign({
    bucket: deps.bucket,
    key,
    contentType: input.contentType,
    bytes: input.bytes,
    expiresIn: UPLOAD_TTL_SECONDS,
  });
  return {
    key,
    url,
    method: "PUT" as const,
    headers: { "Content-Type": input.contentType },
    expiresAt: new Date(
      deps.now.getTime() + UPLOAD_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}

export async function requestUploadUrl(
  actor: Actor,
  data: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  requirePermission(actor, "content.upload");
  const input = parse(requestUploadSchema, data);
  const config = r2ConfigFromEnv(env);
  if (!config)
    throw new HttpsError(
      "failed-precondition",
      "Media uploads are not configured for this environment.",
    );
  const content = await db().collection("content").doc(input.contentId).get();
  if (!content.exists)
    throw new HttpsError("not-found", "Save the content item first.");
  const slot = await buildUploadSlot(input, {
    presign: s3Presigner(config),
    bucket: config.bucket,
    now: new Date(),
  });
  await db().runTransaction(async (tx) => {
    writeAudit(tx, actor, {
      action: "media.uploadSlot",
      entity: "media",
      entityId: input.contentId,
      beforeSummary: null,
      afterSummary: {
        key: slot.key,
        contentType: input.contentType,
        bytes: input.bytes,
      },
    });
  });
  return slot;
}
