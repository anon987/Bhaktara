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
import { MediaType, mediaTypes, probe, processMedia } from "./process";
import { r2FromEnv } from "./r2";

const usage = `Usage: npm run media:publish -- --type <type> --id <content-id> [inputs] [options]

Types: ${mediaTypes.join(", ")}
Inputs: --audio <file>  --image <file>  --video <file>
Options:
  --dry-run              Process locally and write renditions to --out; no upload.
  --out <dir>            Dry-run output directory (default: media-out).
  --confirm-bucket <b>   Required to write to a bucket not ending in "-dev".

Prints the Firestore "media" object (asset keys + metadata) on stdout.`;

export async function publish(argv: string[]) {
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
  // Resolve credentials before any slow processing so mistakes fail fast.
  const r2 = values["dry-run"] ? null : r2FromEnv(values["confirm-bucket"]);
  const warn = (message: string) => console.error(`warning: ${message}`);
  const work = await mkdtemp(join(tmpdir(), "bhaktara-media-"));
  try {
    const renditions = await processMedia(
      type,
      { audio: values.audio, image: values.image, video: values.video },
      work,
      warn,
    );
    const media: Record<string, MediaVariant> = {};
    for (const rendition of renditions) {
      const body = await readFile(rendition.path);
      const hash = createHash("sha256").update(body).digest("hex");
      const key = buildMediaKey({
        type,
        id: values.id,
        variant: rendition.variant,
        hash,
        ext: rendition.ext,
      });
      const { width, height, durationSeconds, bitrate } = await probe(
        rendition.path,
      );
      media[rendition.variant] = mediaVariantSchema.parse({
        key,
        bytes: body.length,
        mime: rendition.mime,
        width,
        height,
        durationSeconds,
        bitrate,
      });
      if (rendition.variant === "video720" && body.length > 6 * 1024 * 1024)
        warn(
          `video720 is ${(body.length / 1048576).toFixed(1)} MB; target is under 6 MB.`,
        );
      if (r2) {
        const result = await r2.putImmutable(key, body, rendition.mime);
        console.error(
          `${result === "exists" ? "unchanged" : "uploaded "} ${key}`,
        );
      } else {
        const target = join(values.out, key);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(rendition.path, target);
        console.error(`wrote     ${target}`);
      }
    }
    console.log(JSON.stringify({ media }, null, 2));
    return media;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("publish.ts")) {
  publish(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
