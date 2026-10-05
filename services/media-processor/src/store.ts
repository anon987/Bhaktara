import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { assetKeySchema } from "../../../src/domain/media";
import { ObjectTooLargeError, R2Bucket } from "../../../scripts/media/r2";

// The object storage the processor needs. Production uses R2 (S3 API) via
// scripts/media/r2.ts; tests and local runs use a directory on disk.
export type MediaStore = {
  label: string;
  head(key: string): Promise<{ bytes: number } | null>;
  // Bytes written, or null when the object does not exist. Throws
  // ObjectTooLargeError past maxBytes.
  download(key: string, path: string, maxBytes: number): Promise<number | null>;
  putImmutable(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<"exists" | "uploaded">;
  getJson(key: string): Promise<unknown>;
  putJson(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};

export const r2Store = (bucket: R2Bucket): MediaStore => ({
  label: `r2:${bucket.bucket}`,
  head: bucket.head,
  download: bucket.download,
  putImmutable: bucket.putImmutable,
  getJson: bucket.getJson,
  putJson: bucket.putJson,
  remove: bucket.remove,
});

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

// Filesystem-backed fake of the bucket: object key = relative path.
export function fsStore(root: string): MediaStore {
  const base = resolve(root);
  const pathOf = (key: string) => {
    assetKeySchema.parse(key);
    const path = resolve(base, key);
    if (!path.startsWith(base + sep)) throw new Error("Key escapes the store");
    return path;
  };
  const head = async (key: string) => {
    try {
      return { bytes: (await stat(pathOf(key))).size };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  };
  return {
    label: "local",
    head,
    async download(key, path, maxBytes) {
      const found = await head(key);
      if (!found) return null;
      if (found.bytes > maxBytes)
        throw new ObjectTooLargeError(`${key} exceeds ${maxBytes} bytes`);
      await copyFile(pathOf(key), path);
      return found.bytes;
    },
    async putImmutable(key, body) {
      if ((await head(key))?.bytes === body.length) return "exists";
      await mkdir(dirname(pathOf(key)), { recursive: true });
      await writeFile(pathOf(key), body);
      return "uploaded";
    },
    async getJson(key) {
      try {
        return JSON.parse(await readFile(pathOf(key), "utf8"));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async putJson(key, value) {
      await mkdir(dirname(pathOf(key)), { recursive: true });
      await writeFile(pathOf(key), JSON.stringify(value));
    },
    async remove(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}
