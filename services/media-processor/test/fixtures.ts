import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

// Synthetic test media only: ffmpeg lavfi sources (tones, gradients and the
// test pattern). No third-party media is used.
const run = promisify(execFile);

export async function scratch(prefix = "processor-test-") {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function lavfi(output: string, args: string[]) {
  await mkdir(dirname(output), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
    output,
  ]);
  return output;
}

export const tone = (output: string, seconds: number) =>
  lavfi(output, [
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=432:sample_rate=44100:duration=${seconds}`,
  ]);

export const gradient = (output: string, width: number, height: number) =>
  lavfi(output, [
    "-f",
    "lavfi",
    "-i",
    `gradients=size=${width}x${height}:duration=1:speed=0.01`,
    "-frames:v",
    "1",
  ]);

export const testClip = (output: string, seconds: number) =>
  lavfi(output, [
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=180x320:rate=30:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=528:duration=${seconds}`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
  ]);

// A staging key exactly as requestUploadUrl issues it.
export const stagingKey = (contentId: string, ext: string) =>
  `staging/${contentId}/${randomUUID()}.${ext}`;

export const bytesOf = (path: string) => readFile(path);
