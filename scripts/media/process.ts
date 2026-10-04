import { spawn } from "node:child_process";
import { join } from "node:path";
import { MediaVariantName } from "../../src/domain/media";

// Media processor shared by single uploads and bulk seeding (doc 22 §A4).
// Renditions follow doc 12 §6 / doc 22 §A3. All outputs drop source metadata
// (EXIF, GPS, encoder tags) so nothing private leaks to the public CDN.
export const mediaTypes = [
  "bhajan",
  "aarti",
  "mantra",
  "chalisa",
  "ringtone",
  "wallpaper",
  "status",
  "banner",
  "deity",
] as const;
export type MediaType = (typeof mediaTypes)[number];
export type Inputs = { audio?: string; image?: string; video?: string };
export type Rendition = {
  variant: MediaVariantName;
  path: string;
  ext: string;
  mime: string;
};
export type Probe = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
};

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(`${command} failed (${code}): ${stderr.slice(-800)}`),
          ),
    );
  });
}

export async function probe(path: string): Promise<Probe> {
  const data = JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      path,
    ]),
  ) as {
    streams: { codec_type: string; width?: number; height?: number }[];
    format: { duration?: string; bit_rate?: string; format_name?: string };
  };
  const visual = data.streams.find((stream) => stream.codec_type === "video");
  const still = /image2|_pipe|webp/.test(data.format.format_name ?? "");
  const duration = Number(data.format.duration);
  const bitrate = Number(data.format.bit_rate);
  return {
    width: visual?.width,
    height: visual?.height,
    durationSeconds:
      !still && Number.isFinite(duration) && duration > 0
        ? Math.round(duration * 10) / 10
        : undefined,
    bitrate:
      !still && Number.isFinite(bitrate) && bitrate > 0
        ? Math.round(bitrate)
        : undefined,
  };
}

const ffmpeg = (args: string[]) =>
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
// Scale to cover the box, then centre-crop to exact dimensions.
const cover = (width: number, height: number) =>
  `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
async function webp(
  input: string,
  output: string,
  filter: string,
  seek?: number,
) {
  await ffmpeg([
    ...(seek === undefined ? [] : ["-ss", String(seek)]),
    "-i",
    input,
    "-map_metadata",
    "-1",
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "82",
    output,
  ]);
}
// Doc 12 §6: loudness-normalized to about -16 LUFS.
const loudnorm = "loudnorm=I=-16:TP=-1.5:LRA=11";

function need<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

export async function processMedia(
  type: MediaType,
  inputs: Inputs,
  dir: string,
  warn: (message: string) => void,
): Promise<Rendition[]> {
  const out = (name: string) => join(dir, name);
  const renditions: Rendition[] = [];
  const add = (variant: MediaVariantName, ext: string, mime: string) => {
    const path = out(`${variant}.${ext}`);
    renditions.push({ variant, path, ext, mime });
    return path;
  };
  switch (type) {
    case "bhajan":
    case "aarti":
    case "mantra":
    case "chalisa": {
      const audio = need(inputs.audio, `${type} needs --audio`);
      const image = need(
        inputs.image,
        `${type} needs --image for the thumbnail`,
      );
      await ffmpeg([
        "-i",
        audio,
        "-vn",
        "-map_metadata",
        "-1",
        "-af",
        loudnorm,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        add("stream", "m4a", "audio/mp4"),
      ]);
      await webp(image, add("thumb", "webp", "image/webp"), cover(320, 320));
      break;
    }
    case "ringtone": {
      const audio = need(inputs.audio, "ringtone needs --audio");
      const image = need(
        inputs.image,
        "ringtone needs --image for the thumbnail",
      );
      const { durationSeconds = 0 } = await probe(audio);
      if (durationSeconds < 20 || durationSeconds > 30)
        throw new Error(
          `Ringtones must be 20–30 s (doc 12 §6); got ${durationSeconds} s`,
        );
      await ffmpeg([
        "-i",
        audio,
        "-vn",
        "-map_metadata",
        "-1",
        "-af",
        loudnorm,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "160k",
        "-ar",
        "44100",
        add("file", "mp3", "audio/mpeg"),
      ]);
      await webp(image, add("thumb", "webp", "image/webp"), cover(320, 320));
      break;
    }
    case "wallpaper": {
      const image = need(inputs.image, "wallpaper needs --image");
      const { width = 0, height = 0 } = await probe(image);
      if (width < 1080 || height < 2400)
        throw new Error(
          `Wallpaper masters must be at least 1080×2400; got ${width}×${height}`,
        );
      if (width < 1440 || height < 3200)
        warn(`Master is ${width}×${height}; doc 12 §6 asks for 1440×3200+.`);
      await webp(image, add("thumb", "webp", "image/webp"), cover(300, 666));
      await webp(image, add("mobile", "webp", "image/webp"), cover(1080, 2400));
      // Full-resolution master for Save/Set, re-encoded to strip metadata.
      await ffmpeg([
        "-i",
        image,
        "-map_metadata",
        "-1",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        add("full", "jpg", "image/jpeg"),
      ]);
      break;
    }
    case "status": {
      const video = need(inputs.video, "status needs --video");
      const { durationSeconds = 0, width = 0, height = 0 } = await probe(video);
      if (durationSeconds < 15 || durationSeconds > 30)
        throw new Error(
          `Status videos must be 15–30 s (doc 12 §6); got ${durationSeconds} s`,
        );
      if (width && height && Math.abs(width / height - 9 / 16) > 0.02)
        warn(
          `Source is ${width}×${height}; it will be centre-cropped to 9:16.`,
        );
      const path = add("video720", "mp4", "video/mp4");
      await ffmpeg([
        "-i",
        video,
        "-map_metadata",
        "-1",
        "-vf",
        `${cover(720, 1280)},fps=30`,
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "slow",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        path,
      ]);
      // The poster comes from --image, or a frame one second in.
      const source = inputs.image ?? video;
      const seek = inputs.image ? undefined : 1;
      await webp(
        source,
        add("poster", "webp", "image/webp"),
        cover(720, 1280),
        seek,
      );
      await webp(
        source,
        add("thumb", "webp", "image/webp"),
        cover(306, 544),
        seek,
      );
      break;
    }
    case "banner": {
      const image = need(inputs.image, "banner needs --image");
      await webp(image, add("mobile", "webp", "image/webp"), "scale=1080:-2");
      await webp(image, add("thumb", "webp", "image/webp"), "scale=320:-2");
      break;
    }
    case "deity": {
      const image = need(inputs.image, "deity needs --image");
      await webp(image, add("mobile", "webp", "image/webp"), "scale=1080:-2");
      await webp(image, add("thumb", "webp", "image/webp"), cover(320, 320));
      break;
    }
  }
  return renditions;
}
