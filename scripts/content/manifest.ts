import { z } from "zod";
import { contentTypes } from "../../src/domain/models";
import { Media } from "../../src/domain/media";
import { contentSearchTokens, SearchDeity } from "../../src/domain/search";
import {
  checkItems,
  checklistState as typedChecklistState,
  sacredTypes,
} from "../../src/domain/checklist";

// Seed/import manifest (doc 18 §3, doc 09 §4). One row per content item.
// List columns use "|" between values; checklist columns are check_<item>.
// The doc 12 §5 checklist lives in src/domain/checklist.ts so the importer,
// the CMS Cloud Functions and the admin app enforce the same items.
export {
  applicableChecks,
  checklist,
  type CheckItem,
} from "../../src/domain/checklist";
const allCheckItems = new Set<string>(checkItems);

const columns = new Set([
  "importKey",
  "type",
  "title_hi",
  "title_en",
  "description_hi",
  "description_en",
  "deityIds",
  "categoryIds",
  "tags",
  "audioLanguage",
  "audio",
  "image",
  "video",
  "saveGate",
  "isShareable",
  "adEligible",
  "isFeatured",
  "sourceText",
  "sourceTextRef",
  "aiTool",
  "aiPlan",
  "licenseRecordId",
]);
// Typos in headers would otherwise silently drop data.
export function unknownColumns(keys: Iterable<string>): string[] {
  return [...keys].filter(
    (key) =>
      !columns.has(key) &&
      !(key.startsWith("check_") && allCheckItems.has(key.slice(6))),
  );
}

// RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Unterminated quoted field in CSV");
  if (field !== "" || row.length) rows.push([...row, field]);
  const [header, ...body] = rows.filter((cells) =>
    cells.some((cell) => cell.trim() !== ""),
  );
  if (!header) return [];
  const names = header.map((name) => name.trim());
  return body.map((cells, line) => {
    if (cells.length > names.length)
      throw new Error(`CSV row ${line + 2} has more cells than the header`);
    return Object.fromEntries(
      names.map((name, column) => [name, cells[column] ?? ""]),
    );
  });
}

const slug = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,99}$/,
    "must be a lowercase slug (a-z, 0-9, _ or -)",
  );
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const split = (value: unknown) =>
  Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean)
      : (value ?? []);
const flag = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (["true", "yes", "y", "1", "x"].includes(text)) return true;
    if (["false", "no", "n", "0"].includes(text)) return false;
    return value;
  }, z.boolean());
const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const rowSchema = z
  .object({
    importKey: slug,
    type: z.preprocess(
      (value) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
      z.enum(contentTypes),
    ),
    title_hi: text(120),
    title_en: text(120),
    description_hi: text(600),
    description_en: text(600),
    deityIds: z.preprocess(
      split,
      z.array(slug).min(1, "needs at least one deity"),
    ),
    categoryIds: z.preprocess(split, z.array(slug)),
    tags: z.preprocess(split, z.array(z.string().min(1).max(60)).max(40)),
    audioLanguage: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^[a-z]{2,3}$/, "use a language code such as hi or sa")
        .optional(),
    ),
    audio: optional(500),
    image: optional(500),
    video: optional(500),
    saveGate: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim()
          ? value.trim().toUpperCase()
          : undefined,
      z.enum(["REWARDED", "FREE"]).optional(),
    ),
    isShareable: flag(true),
    adEligible: flag(true),
    isFeatured: flag(false),
    sourceText: optional(20000),
    sourceTextRef: optional(300),
    aiTool: text(100),
    aiPlan: text(100),
    licenseRecordId: optional(100),
    checks: z.record(z.string(), flag(false)),
  })
  .superRefine((row, context) => {
    const need = (field: keyof typeof row, why: string) => {
      if (!row[field])
        context.addIssue({ code: "custom", path: [field], message: why });
    };
    if (sacredTypes.includes(row.type)) {
      need(
        "sourceText",
        "sacred text types need the canonical source text (doc 12 §3)",
      );
      need(
        "sourceTextRef",
        "sacred text types need a source reference (doc 12 §3)",
      );
    }
    if (
      ["BHAJAN", "AARTI", "MANTRA", "CHALISA", "RINGTONE"].includes(row.type)
    ) {
      need("audio", `${row.type} needs an audio file`);
      need("image", `${row.type} needs a thumbnail image`);
    }
    if (row.type === "WALLPAPER") need("image", "WALLPAPER needs an image");
    if (row.type === "STATUS") need("video", "STATUS needs a video");
  });
export type ManifestRow = z.infer<typeof rowSchema>;

export function parseRow(record: Record<string, unknown>) {
  const checks = Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key.startsWith("check_"))
      .map(([key, value]) => [key.slice(6), value]),
  );
  const result = rowSchema.safeParse({ ...record, checks });
  return result.success
    ? { row: result.data, errors: [] as string[] }
    : {
        row: null,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
        ),
      };
}

export const checklistState = (row: ManifestRow) =>
  typedChecklistState(row.type, row.checks);

export type DeityInfo = SearchDeity;
export type ExistingContent = {
  status: string;
  popularityScore?: number;
  publishedAt?: unknown;
} | null;
const lockedStatuses = ["PUBLISHED", "SCHEDULED", "ARCHIVED"];

// Builds the public content document and its private provenance record.
// Imports land in DRAFT or READY (doc 09 §4); publishReady is a dev-only
// shortcut until the transitionContentStatus function exists (doc 08).
export function buildDocuments(input: {
  row: ManifestRow;
  media: Media;
  deities: Map<string, DeityInfo>;
  existing: ExistingContent;
  publishReady: boolean;
  now: unknown;
}) {
  const { row, media, deities, existing, now } = input;
  const { values, missing } = checklistState(row);
  let status: string;
  if (existing && lockedStatuses.includes(existing.status)) {
    // Never move live items backwards silently.
    if (missing.length)
      throw new Error(
        `${row.importKey} is ${existing.status}; its checklist must stay complete (missing ${missing.join(", ")})`,
      );
    status = existing.status;
  } else if (missing.length) status = "DRAFT";
  else status = input.publishReady ? "PUBLISHED" : "READY";
  const content = stripUndefined({
    type: row.type,
    status,
    title: { hi: row.title_hi, en: row.title_en },
    description: { hi: row.description_hi, en: row.description_en },
    slug: row.importKey,
    audioLanguage: row.audioLanguage,
    deityIds: row.deityIds,
    categoryIds: row.categoryIds,
    tags: row.tags,
    // Doc 22 B1: the CMS functions use the same builder on every write.
    searchTokens: contentSearchTokens(
      {
        title: { hi: row.title_hi, en: row.title_en },
        tags: row.tags,
        deityIds: row.deityIds,
        categoryIds: row.categoryIds,
      },
      deities,
    ),
    media,
    durationSeconds:
      media.stream?.durationSeconds ??
      media.file?.durationSeconds ??
      media.video720?.durationSeconds,
    isFeatured: row.isFeatured,
    isPremium: false,
    // D-038/D-041: device saves of wallpapers, ringtones and status are rewarded.
    saveGate:
      row.saveGate ??
      (["WALLPAPER", "RINGTONE", "STATUS"].includes(row.type)
        ? "REWARDED"
        : "FREE"),
    isShareable: row.isShareable,
    adEligible: row.adEligible,
    popularityScore: existing?.popularityScore ?? 0,
    publishedAt:
      existing?.publishedAt ?? (status === "PUBLISHED" ? now : undefined),
    updatedAt: now,
  });
  const privateRecord = stripUndefined({
    importKey: row.importKey,
    sourceText: row.sourceText,
    sourceTextRef: row.sourceTextRef,
    aiTool: row.aiTool,
    aiPlan: row.aiPlan,
    licenseRecordId: row.licenseRecordId,
    checklist: values,
    updatedBy: "content-import",
    updatedAt: now,
    ...(existing ? {} : { createdBy: "content-import", createdAt: now }),
  });
  return { contentId: row.importKey, status, missing, content, privateRecord };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
