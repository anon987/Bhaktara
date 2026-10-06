// Admin panel v2: the asset library. Images for banners, deities, festivals,
// Mandir offerings and collection covers are uploaded straight to R2 staging
// (presigned PUT), rendered by the Cloud Run media processor (banner or deity
// renditions, doc 22 §A3) and registered in mediaAssets/{assetId}, where the
// editors pick them. Content audio/video keeps its own processMedia flow.
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  assetMediaType,
  AssetPurpose,
  deleteAssetSchema,
  processAssetSchema,
  requestAssetUploadSchema,
} from "../../src/domain/admin";
import { isStagingKeyFor, ProcessResponse } from "../../src/domain/mediaProcessing";
import { Actor, db, parse, requirePermission, writeAudit } from "./core";
import { ProcessorClient, processorClientFromEnv, toHttpsError } from "./media";
import { buildUploadSlot, r2ConfigFromEnv, s3Presigner } from "./uploads";

const assetRef = (id: string) => db().collection("mediaAssets").doc(id);

export async function requestAssetUpload(
  actor: Actor,
  data: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  requirePermission(actor, "asset.write");
  const input = parse(requestAssetUploadSchema, data);
  const config = r2ConfigFromEnv(env);
  if (!config)
    throw new HttpsError(
      "failed-precondition",
      "Media uploads are not configured for this environment.",
    );
  const assetId = `${input.purpose}-${randomBytes(4).toString("hex")}`;
  const slot = await buildUploadSlot(
    { contentId: assetId, contentType: input.contentType, bytes: input.bytes },
    { presign: s3Presigner(config), bucket: config.bucket, now: new Date() },
  );
  await db().runTransaction(async (tx) => {
    tx.create(assetRef(assetId), {
      purpose: input.purpose,
      label: input.label,
      status: "UPLOADING",
      stagingKey: slot.key,
      bytes: input.bytes,
      contentType: input.contentType,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, actor, {
      action: "asset.uploadSlot",
      entity: "asset",
      entityId: assetId,
      beforeSummary: null,
      afterSummary: { purpose: input.purpose, label: input.label },
    });
  });
  return { assetId, ...slot };
}

export async function processAsset(
  actor: Actor,
  data: unknown,
  deps: { processor?: ProcessorClient | null } = {},
) {
  requirePermission(actor, "asset.write");
  const input = parse(processAssetSchema, data);
  // Configuration first (as processMedia does), so the panel can ask whether
  // processing works before it creates anything.
  const processor =
    deps.processor === undefined ? processorClientFromEnv(process.env) : deps.processor;
  if (!processor)
    throw new HttpsError(
      "failed-precondition",
      "Media processing is not configured for this environment.",
    );
  const snapshot = await assetRef(input.assetId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Asset not found.");
  if (!isStagingKeyFor(input.assetId, "image", input.image))
    throw new HttpsError("invalid-argument", "That upload does not belong to this asset.");
  const type = assetMediaType(snapshot.get("purpose") as AssetPurpose);
  let result: ProcessResponse;
  try {
    result = await processor({ contentId: input.assetId, type, inputs: { image: input.image } });
  } catch (error) {
    throw toHttpsError(error, input.assetId);
  }
  const prefix = `${type}/${input.assetId}/`;
  if (Object.values(result.media).some((variant) => !variant?.key.startsWith(prefix)))
    throw new HttpsError("unavailable", "The processor returned unexpected keys.");
  await db().runTransaction(async (tx) => {
    tx.update(assetRef(input.assetId), {
      status: "READY",
      type,
      media: result.media,
      warnings: result.warnings ?? [],
      processedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, actor, {
      action: "asset.process",
      entity: "asset",
      entityId: input.assetId,
      beforeSummary: null,
      afterSummary: { keys: Object.values(result.media).map((variant) => variant?.key) },
    });
  });
  return { assetId: input.assetId, media: result.media, warnings: result.warnings ?? [] };
}

// Removes the asset from the library. The R2 objects stay until the 30-day
// cleanup (doc 09 §5), so anything still pointing at them keeps working.
export async function deleteAsset(actor: Actor, data: unknown) {
  requirePermission(actor, "asset.write");
  const input = parse(deleteAssetSchema, data);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(assetRef(input.assetId));
    if (!existing.exists) throw new HttpsError("not-found", "Asset not found.");
    tx.delete(assetRef(input.assetId));
    writeAudit(tx, actor, {
      action: "asset.delete",
      entity: "asset",
      entityId: input.assetId,
      beforeSummary: { label: existing.get("label"), media: existing.get("media") ?? null },
      afterSummary: null,
    });
  });
  return { assetId: input.assetId };
}
