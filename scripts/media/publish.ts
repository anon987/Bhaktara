import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  buildMediaKey,
  MediaVariant,
  mediaVariantSchema,
} from "../../src/domain/media";
import { Inputs, MediaType, mediaTypes, probe, processMedia } from "./process";
import { r2FromEnv } from "./r2";

const usage = `Usage: npm run media:publish -- --type <type> --id <content-id> [inputs] [options]

Types: ${mediaTypes.join(", ")}
Inputs: --audio <file>  --image <file>  --video <file>
Options:
  --dry-run              Process locally and write renditions to --out; no upload.
  --out <dir>            Dry-run output directory (default: media-out).
  --confirm-bucket <b>   Required to write to a bucket not ending in "-dev".

Prints the Firestore "media" object (asset keys + metadata) on stdout.`;

export type MediaTarget =
  | { kind: "r2"; confirmBucket?: string }
  // Writes renditions under `dir` at their keys: dry runs and local CDN testing.
  | { kind: "local"; dir: string };

export type Uploader = (
  key: string,
  path: string,
  body: Buffer,
  mime: string,
) => Promise<"uploaded" | "unchanged" | "written">;
// Resolve credentials up front so mistakes fail before slow processing.
export function createUploader(target: MediaTarget): Uploader {
  if (target.kind === "r2") {
    const r2 = r2FromEnv(target.confirmBucket);
    return async (key, _path, body, mime) =>
      (await r2.putImmutable(key, body, mime)) === "exists"
        ? "unchanged"
        : "uploaded";
  }
  const { dir } = target;
  return async (key, path) => {
    const local = join(dir, key);
    await mkdir(dirname(local), { recursive: true });
    await copyFile(path, local);
    return "written";
  };
}

export async function publishMedia(input: {
  type: MediaType;
  id: string;
  inputs: Inputs;
  upload: Uploader;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}): Promise<Record<string, MediaVariant>> {
  const log = input.log ?? (() => undefined);
  const warn = input.warn ?? (() => undefined);
  const work = await mkdtemp(join(tmpdir(), "bhaktara-media-"));
  try {
    const renditions = await processMedia(input.type, input.inputs, work, warn);
    const media: Record<string, MediaVariant> = {};
    for (const rendition of renditions) {
      const body = await readFile(rendition.path);
      const hash = createHash("sha256").update(body).digest("hex");
      const key = buildMediaKey({
        type: input.type,
        id: input.id,
        variant: rendition.variant,
        hash,
        ext: rendition.ext,
      });
      const { width, height, durationSeconds, bitrate } = await probe(
        rendition.path,
      );
      // Omit absent metadata: Firestore rejects fields set to undefined.
      const metadata = Object.entries({
        width,
        height,
        durationSeconds,
        bitrate,
      });
      media[rendition.variant] = mediaVariantSchema.parse({
        key,
        bytes: body.length,
        mime: rendition.mime,
        ...Object.fromEntries(
          metadata.filter(([, value]) => value !== undefined),
        ),
      });
      if (rendition.variant === "video720" && body.length > 6 * 1024 * 1024)
        warn(
          `video720 is ${(body.length / 1048576).toFixed(1)} MB; target is under 6 MB.`,
        );
      const result = await input.upload(
        key,
        rendition.path,
        body,
        rendition.mime,
      );
      log(`${result.padEnd(9)} ${key}`);
    }
    return media;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      type: { type: "string" },
      id: { type: "string" },
      audio: { type: "string" },
      image: { type: "string" },
      video: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      out: { type: "string", default: "media-out" },
      "confirm-bucket": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.type || !values.id) {
    console.error(usage);
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  const type = values.type.toLowerCase() as MediaType;
  if (!mediaTypes.includes(type))
    throw new Error(`Unknown type ${values.type}`);
  const upload = createUploader(
    values["dry-run"]
      ? { kind: "local", dir: values.out }
      : { kind: "r2", confirmBucket: values["confirm-bucket"] },
  );
  const media = await publishMedia({
    type,
    id: values.id,
    inputs: { audio: values.audio, image: values.image, video: values.video },
    upload,
    log: (message) => console.error(message),
    warn: (message) => console.error(`warning: ${message}`),
  });
  console.log(JSON.stringify({ media }, null, 2));
}

if (process.argv[1]?.endsWith("publish.ts")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
