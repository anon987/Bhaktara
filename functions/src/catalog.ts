// Admin panel v2 (doc 09 §1): catalogue documents (deities, categories,
// collections, challenges, badges, festivals, Mandir offerings) and the
// versioned app config (gamification, sadhana, puja). Every write is
// validated with the shared schemas in src/domain/admin.ts and audited in the
// same transaction.
import { randomBytes } from "node:crypto";
import { DocumentData, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  CatalogKind,
  catalogKinds,
  ConfigDoc,
  configDocs,
  deleteCatalogItemSchema,
  offerAtKinds,
  rollbackConfigSchema,
  saveCatalogItemSchema,
  saveConfigSchema,
} from "../../src/domain/admin";
import { forbiddenFlowers } from "../../src/domain/puja";
import { Actor, db, parse, requirePermission, stripUndefined, writeAudit } from "./core";

// Deities and categories are referenced by content: they are deactivated,
// never deleted.
const undeletable: CatalogKind[] = ["deity", "category"];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

function newId(kind: CatalogKind, data: Record<string, unknown>) {
  const named = (data.name ?? data.title) as { en?: string } | undefined;
  const base = slugify(named?.en ?? "") || kind.toLowerCase();
  return `${base}-${randomBytes(3).toString("hex")}`;
}

// Stored form: ISO instants become Timestamps; everything else as validated.
function toDocument(kind: CatalogKind, value: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...value };
  if (kind === "challenge" || kind === "mandirOffering")
    for (const field of ["startAt", "endAt"])
      if (typeof out[field] === "string")
        out[field] = Timestamp.fromDate(new Date(out[field] as string));
  return stripUndefined(out);
}

// Mandir decor fields that belong to some kinds only.
const decorFields: { field: string; kinds: string[]; label: string }[] = [
  { field: "stage", kinds: ["temple"], label: "Where the deity stands" },
  { field: "sound", kinds: ["bell"], label: "A sound" },
  { field: "placement", kinds: ["light"], label: "Where it hangs" },
  { field: "flowerKind", kinds: ["flower"], label: "The flower kind" },
  // Special offerings placed on the murti or the altar (D-058).
  { field: "offerAt", kinds: [...offerAtKinds], label: "Where it is offered" },
];
const kindList = (kinds: string[]) =>
  kinds.length === 1
    ? `a ${kinds[0]}`
    : `a ${kinds.slice(0, -1).join(", ")} or ${kinds[kinds.length - 1]}`;
// Temples, lights and bells are nothing but their picture.
const decorNeedsArt = ["temple", "light", "bell"];

export function checkMandirOffering(value: Record<string, unknown>) {
  const kind = value.kind as string;
  const wrong = decorFields.filter(
    (rule) => value[rule.field] !== undefined && !rule.kinds.includes(kind),
  );
  if (wrong.length)
    throw new HttpsError(
      "invalid-argument",
      wrong.map((rule) => `${rule.label} is only for ${kindList(rule.kinds)}.`).join(" "),
      {
        reason: "FIELD_NOT_FOR_KIND",
        issues: wrong.map((rule) => ({
          path: rule.field,
          message: `only for kind ${rule.kinds.join(" | ")}`,
        })),
      },
    );
  if (value.isActive === true && decorNeedsArt.includes(kind) && !value.art)
    throw new HttpsError(
      "failed-precondition",
      `Add the image before showing this ${kind}.`,
      { reason: "ART_REQUIRED" },
    );
  // Never offer a flower to a deity who must not receive it (tulsi to Shiva…).
  const flower = value.flowerKind as string | undefined;
  if (flower) {
    const deityIds = (value.deityIds as string[] | undefined) ?? [];
    const refused = deityIds.filter((deityId) =>
      (forbiddenFlowers[deityId] ?? []).includes(flower as never),
    );
    if (refused.length)
      throw new HttpsError(
        "invalid-argument",
        `${flower} must not be offered to ${refused.join(", ")}.`,
        { reason: "FORBIDDEN_OFFERING", deityIds: refused },
      );
  }
}

function checkPublishable(kind: CatalogKind, value: Record<string, unknown>) {
  // The app drops active deities it cannot draw; refuse them here instead.
  if (kind === "deity" && value.isActive === true && !value.mandirArt)
    throw new HttpsError(
      "failed-precondition",
      "Add the Mandir art before activating this deity.",
      { reason: "ART_REQUIRED" },
    );
  if (kind === "mandirOffering") checkMandirOffering(value);
}

const summary = (data: DocumentData | undefined) =>
  data
    ? stripUndefined({
        name: data.name?.en ?? data.title?.en,
        isActive: data.isActive,
        isPublished: data.isPublished,
        date: data.date,
        // Mandir offerings: what it is and how it unlocks.
        kind: data.kind,
        unlock: data.unlock,
      })
    : null;

export async function saveCatalogItem(actor: Actor, data: unknown) {
  requirePermission(actor, "catalog.write");
  const input = parse(saveCatalogItemSchema, data);
  const { collection, schema } = catalogKinds[input.kind];
  const value = parse(schema as never, input.data) as Record<string, unknown>;
  checkPublishable(input.kind, value);
  if (!input.create && !input.id)
    throw new HttpsError("invalid-argument", "An existing item needs its ID.");
  const id = input.id ?? newId(input.kind, value);
  const ref = db().collection(collection).doc(id);
  const stored = {
    ...toDocument(input.kind, value),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  };
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (input.create && existing.exists)
      throw new HttpsError("already-exists", `"${id}" already exists.`);
    if (!input.create && !existing.exists)
      throw new HttpsError("not-found", `"${id}" was not found.`);
    if (input.create) tx.create(ref, { ...stored, createdAt: FieldValue.serverTimestamp() });
    else tx.set(ref, stored, { merge: false });
    writeAudit(tx, actor, {
      action: `${input.kind}.${input.create ? "create" : "update"}`,
      entity: input.kind,
      entityId: id,
      beforeSummary: summary(existing.data()),
      afterSummary: summary(value),
    });
  });
  return { id };
}

export async function deleteCatalogItem(actor: Actor, data: unknown) {
  requirePermission(actor, "catalog.write");
  const input = parse(deleteCatalogItemSchema, data);
  if (undeletable.includes(input.kind))
    throw new HttpsError(
      "failed-precondition",
      "Content refers to this; deactivate it instead.",
      { reason: "DEACTIVATE_INSTEAD" },
    );
  const ref = db().collection(catalogKinds[input.kind].collection).doc(input.id);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new HttpsError("not-found", "Not found.");
    tx.delete(ref);
    writeAudit(tx, actor, {
      action: `${input.kind}.delete`,
      entity: input.kind,
      entityId: input.id,
      beforeSummary: summary(existing.data()),
      afterSummary: null,
    });
  });
  return { id: input.id };
}

// ---- Versioned config ----------------------------------------------------------

function checkConfig(id: ConfigDoc, value: Record<string, unknown>) {
  if (id === "gamification") {
    // Doc 09 §11: the cap must be at least the largest single award.
    const xp = value.xp as Record<string, number>;
    const limits = value.limits as { dailyXpCap: number };
    const largest = Math.max(...Object.values(xp));
    if (limits.dailyXpCap < largest)
      throw new HttpsError(
        "invalid-argument",
        `The daily cap (${limits.dailyXpCap}) is below the largest award (${largest}).`,
        { reason: "CAP_TOO_LOW" },
      );
  }
  if (id === "sadhana") {
    const items = value.prayerItems as { required: boolean }[];
    if (!items.some((item) => item.required))
      throw new HttpsError(
        "invalid-argument",
        "At least one puja offering must be required.",
        { reason: "NO_REQUIRED_OFFERING" },
      );
  }
  if (id === "puja") {
    // Never offer what a deity must not receive (ketaki/tulsi to Shiva…).
    const deities = value.deities as Record<string, { flowers: string[] }>;
    for (const [deityId, offerings] of Object.entries(deities)) {
      const banned = forbiddenFlowers[deityId] ?? [];
      const bad = offerings.flowers.filter((flower) => banned.includes(flower as never));
      if (bad.length)
        throw new HttpsError(
          "invalid-argument",
          `${bad.join(", ")} must not be offered to ${deityId}.`,
          { reason: "FORBIDDEN_OFFERING" },
        );
    }
  }
}

async function writeConfig(
  actor: Actor,
  id: ConfigDoc,
  data: unknown,
  expectedVersion: number,
  action: string,
) {
  const parsed = configDocs[id].safeParse({ ...(data as object), version: expectedVersion + 1 });
  if (!parsed.success)
    throw new HttpsError("invalid-argument", "Some fields are invalid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  const value = parsed.data as Record<string, unknown>;
  checkConfig(id, value);
  const ref = db().collection("appConfig").doc(id);
  return db().runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const version = (current.get("version") as number | undefined) ?? 0;
    if (version !== expectedVersion)
      throw new HttpsError(
        "failed-precondition",
        "Someone saved this config meanwhile. Reload and try again.",
        { reason: "STALE", version },
      );
    tx.set(ref, value);
    tx.set(ref.collection("versions").doc(String(value.version)), {
      data: value,
      savedBy: actor.uid,
      savedAt: FieldValue.serverTimestamp(),
      action,
    });
    writeAudit(tx, actor, {
      action: `config.${action}`,
      entity: "config",
      entityId: id,
      beforeSummary: { version },
      afterSummary: { version: value.version },
    });
    return { id, version: value.version as number };
  });
}

export async function saveConfig(actor: Actor, data: unknown) {
  requirePermission(actor, "config.write");
  const input = parse(saveConfigSchema, data);
  return writeConfig(actor, input.id, input.data, input.expectedVersion, "save");
}

export async function rollbackConfig(actor: Actor, data: unknown) {
  requirePermission(actor, "config.write");
  const input = parse(rollbackConfigSchema, data);
  const old = await db()
    .collection("appConfig")
    .doc(input.id)
    .collection("versions")
    .doc(String(input.toVersion))
    .get();
  if (!old.exists) throw new HttpsError("not-found", "That version does not exist.");
  return writeConfig(actor, input.id, old.get("data"), input.expectedVersion, `rollback-${input.toVersion}`);
}
