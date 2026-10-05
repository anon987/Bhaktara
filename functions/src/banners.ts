import { DocumentData, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  BannerInput,
  createBannerSchema,
  deleteBannerSchema,
  updateBannerSchema,
} from "../../src/domain/cms";
import { bannerDocumentSchema } from "../../src/repositories/firestoreSchemas";
import {
  Actor,
  db,
  parse,
  requirePermission,
  stripUndefined,
  writeAudit,
} from "./core";

const bannerRef = (id: string) => db().collection("banners").doc(id);

// Doc 06 §3 banner document. Inactive banners are kept for later reuse.
function toDocument(banner: BannerInput) {
  const value = {
    title: banner.title,
    subtitle: banner.subtitle,
    ctaText: banner.ctaText,
    image: stripUndefined(banner.image),
    target: banner.target,
    priority: banner.priority,
    startAt: Timestamp.fromDate(new Date(banner.startAt)),
    endAt: Timestamp.fromDate(new Date(banner.endAt)),
    isActive: banner.isActive,
    languages: banner.languages,
  };
  // An active banner must satisfy the mobile app's read contract.
  if (value.isActive && !bannerDocumentSchema.safeParse(value).success)
    throw new HttpsError(
      "invalid-argument",
      "This banner would not render in the app.",
    );
  return value;
}

const summary = (banner: DocumentData) => ({
  title: banner.title?.en,
  isActive: banner.isActive,
  priority: banner.priority,
  route: banner.target?.route,
});

export async function createBanner(actor: Actor, data: unknown) {
  requirePermission(actor, "banner.write");
  const { banner } = parse(createBannerSchema, data);
  const value = toDocument(banner);
  const ref = db().collection("banners").doc();
  await db().runTransaction(async (tx) => {
    tx.create(ref, value);
    writeAudit(tx, actor, {
      action: "banner.create",
      entity: "banner",
      entityId: ref.id,
      beforeSummary: null,
      afterSummary: summary(value),
    });
  });
  return { id: ref.id };
}

export async function updateBanner(actor: Actor, data: unknown) {
  requirePermission(actor, "banner.write");
  const { id, banner } = parse(updateBannerSchema, data);
  const value = toDocument(banner);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(bannerRef(id));
    if (!existing.exists)
      throw new HttpsError("not-found", "Banner was not found.");
    tx.set(bannerRef(id), value);
    writeAudit(tx, actor, {
      action: "banner.update",
      entity: "banner",
      entityId: id,
      beforeSummary: summary(existing.data()!),
      afterSummary: summary(value),
    });
  });
  return { id };
}

export async function deleteBanner(actor: Actor, data: unknown) {
  requirePermission(actor, "banner.write");
  const { id } = parse(deleteBannerSchema, data);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(bannerRef(id));
    if (!existing.exists)
      throw new HttpsError("not-found", "Banner was not found.");
    tx.delete(bannerRef(id));
    writeAudit(tx, actor, {
      action: "banner.delete",
      entity: "banner",
      entityId: id,
      beforeSummary: summary(existing.data()!),
      afterSummary: null,
    });
  });
  return { id };
}
