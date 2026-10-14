import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  AssetPurpose,
  deityInputSchema,
  mandirOfferingInputSchema,
  offeringKinds,
  offeringUnlocks,
  OfferingKind,
  templeStageSchema,
} from "../src/domain/admin";
import { slugSchema } from "../src/domain/cms";
import { buildMediaKey, MediaVariant } from "../src/domain/media";
import { flowerKinds, forbiddenFlowers } from "../src/domain/puja";
import { r2ConfigFromEnv } from "./media/r2";
import { createUploader, Uploader } from "./media/publish";
import {
  describeTarget,
  FirestoreTarget,
  withFirestore,
} from "./firebase/target";

const usage = `Seed the Mandir decor (temples, lights, bells, flowers and each deity's
murti) from assets/mandir/manifest.json into the admin catalogue.

  npx tsx --env-file-if-exists=.env.r2 scripts/seed-mandir-decor.ts [options]

Writes mandirOfferings/{id} (ids from the manifest, active, for every deity),
deities/{id}.murtiArt (creating vishnu, lakshmi, ram, saraswati… when they
are missing) and library entries in mediaAssets, plus one audit entry.
Re-running updates the same documents; it never duplicates them.

Target:
  --emulator             The local emulator (default; 127.0.0.1:8080).
  --project bhaktara-dev The dev project (Application Default Credentials).
                         Needs --yes. No other project is accepted.
  --yes                  Confirms writing to bhaktara-dev.

Media (images and sounds are uploaded as they are, content-addressed):
  (default)              Upload to R2 when R2_* are set (.env.r2); on the
                         emulator without them, store the keys only.
  --local-media <dir>    Emulator only: write the files under <dir>/<key>.
  --no-upload            Emulator only: store the keys, upload nothing.
  --confirm-bucket <b>   Required to upload to a bucket not ending in "-dev".

Other:
  --manifest <file>      Default: assets/mandir/manifest.json.
  --only-missing         Leave offerings that already exist untouched
                         (keeps operator edits); deities still get the murti
                         only when they have none.
  --help`;

// ---- Manifest -----------------------------------------------------------------

const localized = z.object({ en: z.string().min(1), hi: z.string().min(1) });
const relativePath = z
  .string()
  .regex(/^[a-z0-9_/-]+\.(webp|png|jpg|m4a|mp3)$/, "a path inside assets/mandir");
const manifestSchema = z.object({
  offerings: z
    .array(
      z
        .object({
          id: slugSchema,
          kind: z.enum(offeringKinds),
          name: localized,
          image: relativePath,
          unlock: z.enum(offeringUnlocks),
          sortOrder: z.number().int().min(0).max(10000),
          stage: templeStageSchema.optional(),
          placement: z.enum(["top", "bottom", "sides"]).optional(),
          sound: relativePath.optional(),
          flowerKind: z.enum(flowerKinds).optional(),
        })
        .strict(),
    )
    .min(1),
  murti: z.record(slugSchema, z.object({ image: relativePath, name: localized }).strict()),
});
export type DecorManifest = z.infer<typeof manifestSchema>;

// Kind-only fields, as functions/src/catalog.ts enforces for the admin.
const kindFields = { stage: "temple", sound: "bell", placement: "light", flowerKind: "flower" } as const;
export function manifestProblems(manifest: DecorManifest): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const item of manifest.offerings) {
    if (ids.has(item.id)) problems.push(`${item.id}: duplicated id`);
    ids.add(item.id);
    for (const [field, kind] of Object.entries(kindFields))
      if (item[field as keyof typeof kindFields] !== undefined && item.kind !== kind)
        problems.push(`${item.id}: ${field} is only for a ${kind}`);
    if (item.kind === "bell" && !item.sound) problems.push(`${item.id}: a bell needs its sound`);
  }
  return problems;
}

// ---- Media --------------------------------------------------------------------

const mimeOf: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
};

// Width and height from a WebP header (lossy, lossless or extended).
export function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP")
    return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  return null;
}

// Duration of an M4A from its movie header (mvhd), in seconds.
export function m4aSeconds(bytes: Buffer): number | null {
  const at = bytes.indexOf("mvhd", 0, "ascii");
  if (at < 4) return null;
  const version = bytes[at + 4];
  const timescale = bytes.readUInt32BE(at + (version === 1 ? 24 : 16));
  const duration =
    version === 1 ? Number(bytes.readBigUInt64BE(at + 28)) : bytes.readUInt32BE(at + 20);
  return timescale > 0 && duration > 0 ? Math.round((duration / timescale) * 100) / 100 : null;
}

type Media = { variant: MediaVariant; path: string; body: Buffer };
async function mediaFor(root: string, path: string, id: string, variant: "mobile" | "file"): Promise<Media> {
  const full = join(root, path);
  const body = await readFile(full);
  const ext = extname(path).toLowerCase();
  const mime = mimeOf[ext];
  const hash = createHash("sha256").update(body).digest("hex");
  const key = buildMediaKey({ type: "mandir", id, variant, hash, ext: ext.slice(1) });
  const size = mime === "image/webp" ? webpSize(body) : null;
  const seconds = mime === "audio/mp4" ? m4aSeconds(body) : null;
  return {
    path: full,
    body,
    variant: {
      key,
      bytes: body.length,
      mime,
      ...(size ?? {}),
      ...(seconds ? { durationSeconds: seconds } : {}),
    },
  };
}

// ---- Documents ----------------------------------------------------------------

const artPurpose = (kind: OfferingKind): AssetPurpose =>
  kind === "temple" ? "temple" : kind === "light" || kind === "bell" ? "decor" : "offering";

export type SeedPlan = {
  offerings: { id: string; data: Record<string, unknown>; media: Media[] }[];
  murti: { deityId: string; name: { en: string; hi: string }; media: Media }[];
  assets: { id: string; purpose: AssetPurpose; label: string; media: Media }[];
};

export async function planSeed(manifestPath: string): Promise<SeedPlan> {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const problems = manifestProblems(manifest);
  if (problems.length) throw new Error(`Manifest problems:\n  ${problems.join("\n  ")}`);
  const root = dirname(manifestPath);
  const plan: SeedPlan = { offerings: [], murti: [], assets: [] };
  for (const item of manifest.offerings) {
    const image = await mediaFor(root, item.image, item.id, "mobile");
    const sound = item.sound ? await mediaFor(root, item.sound, item.id, "file") : null;
    const data = mandirOfferingInputSchema.parse({
      name: item.name,
      kind: item.kind,
      art: { mobile: image.variant },
      ...(item.flowerKind ? { flowerKind: item.flowerKind } : {}),
      ...(sound ? { sound: { audio: sound.variant } } : {}),
      ...(item.placement ? { placement: item.placement } : {}),
      ...(item.stage ? { stage: item.stage } : {}),
      // For every deity; the app leaves a flower out where it is forbidden.
      deityIds: [],
      unlock: item.unlock,
      sortOrder: item.sortOrder,
      isActive: true,
    });
    plan.offerings.push({ id: item.id, data, media: sound ? [image, sound] : [image] });
    plan.assets.push({ id: `seed-${item.id}`, purpose: artPurpose(item.kind), label: item.name.en, media: image });
    if (sound) plan.assets.push({ id: `seed-${item.id}-sound`, purpose: "sound", label: `${item.name.en} sound`, media: sound });
  }
  for (const [deityId, murti] of Object.entries(manifest.murti)) {
    const media = await mediaFor(root, murti.image, `murti-${deityId}`, "mobile");
    plan.murti.push({ deityId, name: murti.name, media });
    plan.assets.push({ id: `seed-murti-${deityId}`, purpose: "deity", label: `${murti.name.en} murti`, media });
  }
  // A flower must never be listed for a deity it is forbidden to.
  for (const offering of plan.offerings) {
    const flower = offering.data.flowerKind as string | undefined;
    const deityIds = offering.data.deityIds as string[];
    if (flower && deityIds.some((id) => (forbiddenFlowers[id] ?? []).includes(flower as never)))
      throw new Error(`${offering.id}: ${flower} is forbidden for one of its deities`);
  }
  return plan;
}

const actor = `script:seed-mandir-decor:${userInfo().username}`;
// The media library shows the asset like an admin upload ("deity" renditions
// for images, "sound" for sounds).
const assetDocument = (asset: SeedPlan["assets"][number]) => ({
  purpose: asset.purpose,
  label: asset.label,
  status: "READY",
  type: asset.purpose === "sound" ? "sound" : "deity",
  media: asset.purpose === "sound" ? { file: asset.media.variant } : { mobile: asset.media.variant },
  warnings: [],
  bytes: asset.media.variant.bytes,
  contentType: asset.media.variant.mime,
  createdBy: actor,
});

// Same content, whatever the key order and bookkeeping fields.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !["createdAt", "updatedAt", "updatedBy"].includes(key))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const sameData = (stored: unknown, next: unknown) =>
  JSON.stringify(canonical(stored)) === JSON.stringify(canonical(next));

export type SeedResult = {
  offerings: { created: string[]; updated: string[]; kept: string[] };
  deities: { created: string[]; updated: string[]; kept: string[] };
  assets: number;
};

export async function writeSeed(db: Firestore, plan: SeedPlan, options: { onlyMissing?: boolean } = {}): Promise<SeedResult> {
  const result: SeedResult = {
    offerings: { created: [], updated: [], kept: [] },
    deities: { created: [], updated: [], kept: [] },
    assets: 0,
  };
  const now = FieldValue.serverTimestamp();
  const stamp = { updatedAt: now, updatedBy: actor };
  const batch = db.batch();
  for (const offering of plan.offerings) {
    const ref = db.collection("mandirOfferings").doc(offering.id);
    const existing = await ref.get();
    if (existing.exists && (options.onlyMissing || sameData(existing.data(), offering.data))) {
      result.offerings.kept.push(offering.id);
      continue;
    }
    // A full replace, as saveCatalogItem stores it; createdAt survives.
    batch.set(ref, {
      ...offering.data,
      ...stamp,
      createdAt: existing.get("createdAt") ?? now,
    });
    result.offerings[existing.exists ? "updated" : "created"].push(offering.id);
  }
  const deities = await db.collection("deities").get();
  let nextOrder = Math.max(0, ...deities.docs.map((doc) => Number(doc.get("sortOrder")) || 0)) + 10;
  for (const murti of plan.murti) {
    const ref = db.collection("deities").doc(murti.deityId);
    const existing = deities.docs.find((doc) => doc.id === murti.deityId);
    const murtiArt = { mobile: murti.media.variant };
    if (existing) {
      const current = existing.get("murtiArt.mobile.key") as string | undefined;
      if (current === murtiArt.mobile.key || (options.onlyMissing && current)) {
        result.deities.kept.push(murti.deityId);
        continue;
      }
      batch.update(ref, { murtiArt, ...stamp });
      result.deities.updated.push(murti.deityId);
    } else {
      // Active and drawable straight away: the murti doubles as Mandir art.
      const data = deityInputSchema.parse({
        name: murti.name,
        description: { en: "", hi: "" },
        aliases: [],
        isActive: true,
        isMandirEnabled: true,
        sortOrder: nextOrder,
        mandirArt: murtiArt,
        murtiArt,
      });
      nextOrder += 10;
      batch.set(ref, { ...data, ...stamp, createdAt: now });
      result.deities.created.push(murti.deityId);
    }
  }
  for (const asset of plan.assets) {
    const ref = db.collection("mediaAssets").doc(asset.id);
    const existing = await ref.get();
    batch.set(ref, {
      ...assetDocument(asset),
      createdAt: existing.get("createdAt") ?? now,
      processedAt: now,
    });
    result.assets += 1;
  }
  // Every admin change is audited (doc 09 §16), scripts included; a re-run
  // that changes nothing adds no entry.
  const changed = [result.offerings, result.deities].some((part) => part.created.length || part.updated.length);
  if (changed) batch.create(db.collection("auditLogs").doc(), {
    adminUid: actor,
    action: "mandirDecor.seed",
    entity: "mandirOffering",
    entityId: "seed-mandir-decor",
    beforeSummary: null,
    afterSummary: {
      offeringsCreated: result.offerings.created,
      offeringsUpdated: result.offerings.updated.length,
      deitiesCreated: result.deities.created,
      deitiesUpdated: result.deities.updated,
    },
    createdAt: now,
  });
  await batch.commit();
  return result;
}

// ---- Command line -------------------------------------------------------------

function targetOf(values: { emulator?: boolean; project?: string; yes?: boolean }): FirestoreTarget {
  if (!values.project || values.project === "emulator") return { kind: "emulator" };
  if (values.emulator) throw new Error("Use either --emulator or --project, not both.");
  if (!["dev", "bhaktara-dev"].includes(values.project))
    throw new Error(`Only the emulator or bhaktara-dev can be seeded, not "${values.project}".`);
  if (!values.yes) throw new Error("Writing to bhaktara-dev needs --yes.");
  return { kind: "project", projectId: "bhaktara-dev" };
}

function uploaderFor(
  target: FirestoreTarget,
  values: { "local-media"?: string; "no-upload"?: boolean; "confirm-bucket"?: string },
): { upload: Uploader | null; describe: string } {
  const r2 = !("missing" in r2ConfigFromEnv());
  if (target.kind === "project") {
    if (values["local-media"] || values["no-upload"])
      throw new Error("bhaktara-dev needs the files in R2: drop --local-media / --no-upload.");
    if (!r2) throw new Error("Set R2_* (.env.r2, see docs/MEDIA_R2.md) to upload the decor to R2.");
  }
  if (values["local-media"])
    return { upload: createUploader({ kind: "local", dir: resolve(values["local-media"]) }), describe: `files under ${values["local-media"]}` };
  if (values["no-upload"] || !r2) return { upload: null, describe: "keys only (nothing uploaded)" };
  return { upload: createUploader({ kind: "r2", confirmBucket: values["confirm-bucket"] }), describe: "R2" };
}

async function main() {
  const { values } = parseArgs({
    options: {
      emulator: { type: "boolean", default: false },
      project: { type: "string" },
      yes: { type: "boolean", default: false },
      manifest: { type: "string" },
      "local-media": { type: "string" },
      "no-upload": { type: "boolean", default: false },
      "confirm-bucket": { type: "string" },
      "only-missing": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const target = targetOf(values);
  if (target.kind === "emulator") process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  const { upload, describe } = uploaderFor(target, values);
  const manifest = resolve(values.manifest ?? join("assets", "mandir", "manifest.json"));
  const plan = await planSeed(manifest);
  console.log(`Seeding ${plan.offerings.length} offerings and ${plan.murti.length} murti into ${describeTarget(target)}; media: ${describe}.`);
  if (upload) {
    const files = new Map<string, Media>();
    for (const asset of plan.assets) files.set(asset.media.variant.key, asset.media);
    let changed = 0;
    for (const media of files.values()) {
      const outcome = await upload(media.variant.key, media.path, media.body, media.variant.mime!);
      if (outcome !== "unchanged") changed += 1;
    }
    console.log(`Media: ${files.size} files, ${changed} written, ${files.size - changed} already there.`);
  }
  const result = await withFirestore(target, (db) => writeSeed(db, plan, { onlyMissing: values["only-missing"] }));
  const line = (name: string, part: SeedResult["offerings"]) =>
    `${name}: ${part.created.length} created, ${part.updated.length} updated, ${part.kept.length} unchanged`;
  console.log(line("Offerings", result.offerings));
  console.log(line("Deities", result.deities) + (result.deities.created.length ? ` (new: ${result.deities.created.join(", ")})` : ""));
  console.log(`Library: ${result.assets} entries.`);
}

if (process.argv[1]?.endsWith("seed-mandir-decor.ts"))
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
