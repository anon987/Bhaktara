import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { contentSchema } from "../../src/domain/models";
import { mediaSchema } from "../../src/domain/media";
import { publishedContentSchema } from "../../src/repositories/firestoreSchemas";
import { MediaType } from "../media/process";
import { createUploader, publishMedia, Uploader } from "../media/publish";
import {
  describeTarget,
  FirestoreTarget,
  resolveTarget,
  withFirestore,
} from "../firebase/target";
import {
  buildDocuments,
  DeityInfo,
  ExistingContent,
  ManifestRow,
  parseCsv,
  parseRow,
  unknownColumns,
} from "./manifest";

const usage = `Usage: npm run content:import -- --manifest <file.csv|file.json> [options]

Validates each row, publishes its media, and upserts content/{importKey} and
contentPrivate/{importKey} in Firestore (doc 18 §3). The local emulator is the
default target.

Options:
  --project <dev>        Write to a real project (dev, staging, prod) using
                         Application Default Credentials.
  --confirm-project <id> Required for any project other than bhaktara-dev.
  --assets <dir>         Folder that asset paths are relative to (default: manifest folder).
  --dry-run              Validate rows and process media locally; write nothing.
  --local-media <dir>    Write renditions to <dir> instead of uploading to R2.
  --publish-ready        Emulator/dev only: publish rows whose checklist is complete.
  --confirm-bucket <b>   Required to upload to a bucket not ending in "-dev".
  --report <file>        Also write the per-row report as JSON.`;

export type RowResult = {
  importKey: string;
  line: number;
  outcome: "created" | "updated" | "valid" | "failed";
  status?: string;
  missingChecks?: string[];
  errors: string[];
};

export async function loadManifest(path: string) {
  const raw = await readFile(path, "utf8");
  const records: Record<string, unknown>[] =
    extname(path).toLowerCase() === ".json" ? JSON.parse(raw) : parseCsv(raw);
  if (!Array.isArray(records))
    throw new Error("JSON manifest must be an array of rows");
  const unknown = new Set(
    records.flatMap((record) => unknownColumns(Object.keys(record))),
  );
  if (unknown.size)
    throw new Error(`Unknown manifest columns: ${[...unknown].join(", ")}`);
  return records;
}

async function readDeities(db: Firestore) {
  const snapshot = await db.collection("deities").get();
  return new Map<string, DeityInfo>(
    snapshot.docs.map((item) => {
      const data = item.data() as Partial<DeityInfo>;
      return [
        item.id,
        {
          name: data.name ?? { hi: item.id, en: item.id },
          aliases: data.aliases ?? [],
        },
      ];
    }),
  );
}

export async function importManifest(options: {
  manifest: string;
  assets?: string;
  dryRun?: boolean;
  localMedia?: string;
  publishReady?: boolean;
  confirmBucket?: string;
  target?: FirestoreTarget;
  log?: (message: string) => void;
}): Promise<RowResult[]> {
  const log = options.log ?? (() => undefined);
  const target = options.target ?? { kind: "emulator" };
  // Staging and prod publish only through the reviewed workflow (D-036).
  if (
    options.publishReady &&
    target.kind === "project" &&
    target.projectId !== "bhaktara-dev"
  )
    throw new Error("--publish-ready is only allowed for the emulator and dev");
  const records = await loadManifest(options.manifest);
  const assets = resolve(options.assets ?? dirname(options.manifest));
  const results: RowResult[] = [];
  const seen = new Set<string>();
  const valid: { row: ManifestRow; result: RowResult }[] = [];
  records.forEach((record, index) => {
    const { row, errors } = parseRow(record);
    const importKey = String(record.importKey ?? `(row ${index + 1})`);
    const result: RowResult = {
      importKey,
      line: index + 2,
      outcome: "failed",
      errors,
    };
    if (row && seen.has(row.importKey))
      errors.push("importKey: duplicated in manifest");
    if (row) seen.add(row.importKey);
    results.push(result);
    if (row && !errors.length) valid.push({ row, result });
  });

  // Dry runs process media into a throwaway folder so duration, size and
  // dimension rules are still enforced.
  const scratch = options.dryRun
    ? await mkdtemp(join(tmpdir(), "bhaktara-import-"))
    : null;
  const upload: Uploader = createUploader(
    scratch
      ? { kind: "local", dir: scratch }
      : options.localMedia
        ? { kind: "local", dir: options.localMedia }
        : { kind: "r2", confirmBucket: options.confirmBucket },
  );
  try {
    const run = async (db: Firestore | null) => {
      const deities = db ? await readDeities(db) : null;
      for (const { row, result } of valid) {
        try {
          const unknownDeities = deities
            ? row.deityIds.filter((id) => !deities.has(id))
            : [];
          if (unknownDeities.length)
            throw new Error(
              `deityIds: unknown deity ${unknownDeities.join(", ")}`,
            );
          const inputs: Record<string, string | undefined> = {};
          for (const kind of ["audio", "image", "video"] as const) {
            const value = row[kind];
            if (!value) continue;
            const path = resolve(assets, value);
            await access(path).catch(() => {
              throw new Error(`${kind}: file not found: ${value}`);
            });
            inputs[kind] = path;
          }
          const media = mediaSchema.parse(
            await publishMedia({
              type: row.type.toLowerCase() as MediaType,
              id: row.importKey,
              inputs,
              upload,
              log: (message) => log(`  ${message}`),
              warn: (message) => log(`  warning: ${message}`),
            }),
          );
          const existing = db
            ? (((
                await db.collection("content").doc(row.importKey).get()
              ).data() as ExistingContent | undefined) ?? null)
            : null;
          const built = buildDocuments({
            row,
            media,
            deities: deities ?? new Map(),
            existing,
            publishReady: options.publishReady ?? false,
            now: FieldValue.serverTimestamp(),
          });
          // The app must be able to read the document once it is published.
          contentSchema.parse({ ...built.content, id: built.contentId });
          if (built.status === "PUBLISHED")
            publishedContentSchema.parse({
              ...built.content,
              id: built.contentId,
            });
          result.status = built.status;
          result.missingChecks = built.missing;
          if (db) {
            const batch = db.batch();
            batch.set(
              db.collection("content").doc(built.contentId),
              built.content,
            );
            // Merge keeps createdAt/createdBy from the first import.
            batch.set(
              db.collection("contentPrivate").doc(built.contentId),
              built.privateRecord,
              { merge: true },
            );
            await batch.commit();
            result.outcome = existing ? "updated" : "created";
          } else result.outcome = "valid";
        } catch (error) {
          result.errors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
        log(
          `${result.outcome.padEnd(7)} ${row.importKey}${result.status ? ` → ${result.status}` : ""}`,
        );
      }
    };
    if (options.dryRun) await run(null);
    else await withFirestore(target, run);
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
  return results;
}

async function main(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      assets: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "local-media": { type: "string" },
      "publish-ready": { type: "boolean", default: false },
      "confirm-bucket": { type: "string" },
      report: { type: "string" },
      project: { type: "string" },
      "confirm-project": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.manifest) {
    console.error(usage);
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  const target = resolveTarget(values.project, values["confirm-project"]);
  if (target.kind === "emulator")
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  if (!values["dry-run"]) console.error(`Target: ${describeTarget(target)}`);
  const results = await importManifest({
    target,
    manifest: values.manifest,
    assets: values.assets,
    dryRun: values["dry-run"],
    localMedia: values["local-media"],
    publishReady: values["publish-ready"],
    confirmBucket: values["confirm-bucket"],
    log: (message) => console.error(message),
  });
  const failed = results.filter((result) => result.outcome === "failed");
  for (const result of failed)
    console.error(
      `\nline ${result.line} (${result.importKey}):\n  - ${result.errors.join("\n  - ")}`,
    );
  const count = (outcome: RowResult["outcome"]) =>
    results.filter((result) => result.outcome === outcome).length;
  const drafts = results.filter((result) => result.status === "DRAFT");
  console.error(
    `\n${results.length} rows: ${count("created")} created, ${count("updated")} updated, ${count("valid")} valid (dry run), ${failed.length} failed; ${drafts.length} left in DRAFT (incomplete checklist).`,
  );
  if (values.report)
    await writeFile(values.report, JSON.stringify(results, null, 2));
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("import.ts")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
