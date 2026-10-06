import { unzip } from "fflate";
import type { MediaInputRole } from "../../../../src/domain/mediaProcessing";
import { uploadKinds, type ContentType, type UploadMime } from "../../domain";

// Gathering files for uploads: plain files, whole folders (drag-and-drop or
// the folder picker) and .zip archives, unpacked in the browser.

// The upload type of a file, from its extension (browsers disagree on audio
// MIME types: audio/x-wav, audio/x-m4a …).
const byExtension: Record<string, UploadMime> = {
  ...Object.fromEntries(
    (Object.keys(uploadKinds) as UploadMime[]).map((mime) => [uploadKinds[mime].ext, mime]),
  ),
  jpeg: "image/jpeg",
};
export const extensionOf = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
export const uploadMimeOf = (name: string): UploadMime | null => byExtension[extensionOf(name)] ?? null;
export const roleOf = (mime: UploadMime) => mime.split("/")[0] as MediaInputRole;
export const maxBytesOf = (mime: UploadMime) => uploadKinds[mime].maxBytes;

// A copy of the file carrying its normalised type, so the PUT matches the
// presigned Content-Type.
export const withUploadType = (file: File, mime: UploadMime) =>
  file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });

const isJunk = (path: string) =>
  path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX") ||
  /(^|\/)(thumbs\.db|desktop\.ini)$/i.test(path);

export const isZip = (file: File) =>
  extensionOf(file.name) === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed";

function unzipFile(file: File): Promise<File[]> {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise((resolve, reject) =>
        unzip(new Uint8Array(buffer), (error, entries) => {
          if (error) return reject(new Error(`${file.name} could not be opened as a ZIP.`));
          resolve(
            Object.entries(entries)
              .filter(([path, data]) => !path.endsWith("/") && data.length > 0 && !isJunk(path))
              .map(([path, data]) => {
                const name = path.slice(path.lastIndexOf("/") + 1);
                const mime = uploadMimeOf(name);
                return new File([data as BlobPart], name, mime ? { type: mime } : {});
              }),
          );
        }),
      ),
  );
}

// Replaces every .zip with the files inside it.
export async function expandZips(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    if (isZip(file)) out.push(...(await unzipFile(file)));
    else if (!isJunk(file.webkitRelativePath || file.name)) out.push(file);
  }
  return out;
}

type Entry = FileSystemEntry & {
  file?: (ok: (file: File) => void, fail: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (error: unknown) => void) => void };
};

async function walk(entry: Entry, out: File[]) {
  if (isJunk(entry.fullPath)) return;
  if (entry.isFile && entry.file) {
    out.push(await new Promise<File>((resolve, reject) => entry.file!(resolve, reject)));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns at most 100 entries per call.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

// Files from a drop: folders are walked, ZIPs unpacked.
export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = [...transfer.items]
    .map((item) => (item.kind === "file" ? (item.webkitGetAsEntry?.() as Entry | null) : null))
    .filter((entry): entry is Entry => !!entry);
  const files: File[] = [];
  if (entries.length) for (const entry of entries) await walk(entry, files);
  else files.push(...transfer.files);
  return expandZips(files);
}

// ---- Turning files into content items --------------------------------------

export const baseName = (name: string) => {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
};

// "01 - shiv_tandav-stotram (HQ)" → "Shiv Tandav Stotram"
export function titleFromFileName(name: string): string {
  const words = baseName(name)
    .replace(/[_.]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/-/g, " ")
    .replace(/\((?:hq|hd|official|final|v\d+)\)/gi, " ")
    .replace(/^\s*(?:track\s*)?\d{1,3}[\s.)-]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const small = new Set(["a", "an", "and", "of", "the", "to", "in", "on", "ki", "ka", "ke", "se"]);
  return words
    .split(" ")
    .map((word, index) =>
      /^[A-Z0-9]+$/.test(word) && word.length > 1
        ? word
        : index > 0 && small.has(word.toLowerCase())
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ")
    .slice(0, 120);
}

// Lower-case slug for the content ID (slugSchema: a-z, 0-9, _ and -).
export function slugFromFileName(name: string): string {
  const slug = baseName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "item";
}

// What each content type is built from.
export const rolesFor = (type: ContentType): { main: MediaInputRole; extra?: MediaInputRole } =>
  type === "WALLPAPER" ? { main: "image" } : type === "STATUS" ? { main: "video", extra: "image" } : { main: "audio", extra: "image" };

export type PlannedItem = {
  key: string;
  name: string;
  main: File;
  extra?: File;
};
export type Plan = { items: PlannedItem[]; skipped: { name: string; reason: string }[] };

// Groups files into items: one item per main file (audio, image or video),
// plus a cover/poster image with the same base name when there is one.
export function planItems(type: ContentType, files: File[]): Plan {
  const { main, extra } = rolesFor(type);
  const skipped: Plan["skipped"] = [];
  const mains: File[] = [];
  const extras = new Map<string, File>();
  for (const file of files) {
    const mime = uploadMimeOf(file.name);
    if (!mime) {
      skipped.push({ name: file.name, reason: "not a supported file type" });
      continue;
    }
    const role = roleOf(mime);
    if (file.size > maxBytesOf(mime)) {
      skipped.push({ name: file.name, reason: `larger than ${Math.round(maxBytesOf(mime) / 1048576)} MB` });
    } else if (role === main) mains.push(withUploadType(file, mime));
    else if (extra && role === extra) extras.set(baseName(file.name).toLowerCase(), withUploadType(file, mime));
    else skipped.push({ name: file.name, reason: `a ${role} file does not belong in this category` });
  }
  const used = new Set<string>();
  const items = mains.map((file, index) => {
    const base = baseName(file.name).toLowerCase();
    const cover = extras.get(base);
    if (cover) used.add(base);
    return { key: `${index}-${file.name}`, name: file.name, main: file, ...(cover ? { extra: cover } : {}) };
  });
  for (const [base, file] of extras)
    if (!used.has(base)) skipped.push({ name: file.name, reason: "no matching file with the same name" });
  return { items, skipped };
}
