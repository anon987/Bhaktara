// Reads iTunes-style tags (title, artist, lyrics, album art) from an
// .m4a/.mp4 file in the browser. Only the atom headers and the `moov` box are
// read (Blob.slice), never the audio in `mdat`, so multi-megabyte files cost a
// few small reads. Tags live in moov/udta/meta/ilst/{©nam,©ART,©lyr,covr}/data.
export { cleanLyricsForDisplay } from "../domain";

// An .m4a file, by extension or type (browsers say audio/mp4 or audio/x-m4a).
export const isM4a = (file: File) =>
  /\.m4a$/i.test(file.name) || file.type === "audio/mp4" || file.type === "audio/x-m4a";

export type M4aCover ={ mime: "image/jpeg" | "image/png"; bytes: Uint8Array };
export type M4aMetadata = { title?: string; artist?: string; lyrics?: string; cover?: M4aCover };

// Top-level atoms that can start an MP4/QuickTime file.
const firstAtoms = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide", "uuid", "pdin", "styp"]);
// A moov box larger than this is not read (tags are tiny; it would be a broken file).
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAX_TOP_LEVEL_ATOMS = 4096;

const tags = {
  "©nam": "title",
  "©ART": "artist",
  "©lyr": "lyrics",
} as const satisfies Record<string, keyof M4aMetadata>;

type Atom = { type: string; start: number; end: number };

// Atom types are four bytes; "©" (0xA9) decodes as itself in Latin-1.
const typeAt = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  // Older Blob implementations (some test DOMs) only support FileReader.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// Reads one atom header from `header` (the bytes at `offset` in a container
// that ends at `limit`). Null when the header is cut off or its size is invalid.
function parseHeader(header: Uint8Array, offset: number, limit: number) {
  if (header.length < 8) return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const size32 = view.getUint32(0);
  const type = typeAt(header, 4);
  let headerSize = 8;
  let size: number;
  if (size32 === 1) {
    if (header.length < 16) return null;
    size = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
    headerSize = 16;
  } else if (size32 === 0) {
    size = limit - offset; // Extends to the end of its container.
  } else {
    size = size32;
  }
  if (size < headerSize || offset + size > limit) return null;
  return { type, size, headerSize };
}

// The child atoms of the box occupying bytes[start, end).
function children(bytes: Uint8Array, start: number, end: number): Atom[] {
  const atoms: Atom[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const header = parseHeader(bytes.subarray(offset, Math.min(offset + 16, end)), offset, end);
    if (!header) break;
    atoms.push({ type: header.type, start: offset + header.headerSize, end: offset + header.size });
    offset += header.size;
  }
  return atoms;
}

const child = (bytes: Uint8Array, parent: Atom, type: string) =>
  children(bytes, parent.start, parent.end).find((atom) => atom.type === type);

function decodeText(payload: Uint8Array, typeIndicator: number): string {
  // Well-known types 2 (UTF-16BE) and 1 (UTF-8, the norm for iTunes tags).
  const encoding = typeIndicator === 2 ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding)
    .decode(payload)
    .replace(/\0+$/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

// The text of an ilst item: its `data` atom holds a 4-byte type indicator and
// a 4-byte locale before the value.
function itemText(bytes: Uint8Array, item: Atom): string | undefined {
  const data = child(bytes, item, "data");
  if (!data || data.end - data.start < 8) return undefined;
  const typeIndicator = new DataView(bytes.buffer, bytes.byteOffset + data.start, 4).getUint32(0) & 0xffffff;
  const text = decodeText(bytes.subarray(data.start + 8, data.end), typeIndicator);
  return text || undefined;
}

// The image of a covr item: its first `data` atom, type 13 (JPEG) or 14
// (PNG); other type codes are recognised by the image's magic bytes.
function itemCover(bytes: Uint8Array, item: Atom): M4aCover | undefined {
  const data = child(bytes, item, "data");
  if (!data || data.end - data.start <= 8) return undefined;
  const typeIndicator = new DataView(bytes.buffer, bytes.byteOffset + data.start, 4).getUint32(0) & 0xffffff;
  const image = bytes.slice(data.start + 8, data.end);
  const jpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const png = image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;
  const mime =
    typeIndicator === 13 ? "image/jpeg" : typeIndicator === 14 ? "image/png" : jpeg ? "image/jpeg" : png ? "image/png" : null;
  return mime ? { mime, bytes: image } : undefined;
}

// `meta` is a full box (4 bytes of version and flags before its children),
// except in some QuickTime files that go straight to `hdlr`.
function metaChildrenStart(bytes: Uint8Array, meta: Atom) {
  const direct = meta.end - meta.start >= 8 && typeAt(bytes, meta.start + 4) === "hdlr";
  return direct ? meta.start : meta.start + 4;
}

// Parses the tags out of the bytes of a moov box's contents.
export function parseMoov(bytes: Uint8Array): M4aMetadata {
  const result: M4aMetadata = {};
  const moov: Atom = { type: "moov", start: 0, end: bytes.length };
  const udta = child(bytes, moov, "udta");
  const meta = (udta && child(bytes, udta, "meta")) ?? child(bytes, moov, "meta");
  if (!meta) return result;
  const metaBox: Atom = { ...meta, start: metaChildrenStart(bytes, meta) };
  const ilst = child(bytes, metaBox, "ilst");
  if (!ilst) return result;
  for (const item of children(bytes, ilst.start, ilst.end)) {
    if (item.type === "covr") {
      // Several covers: the first one counts.
      if (!result.cover) {
        try {
          const cover = itemCover(bytes, item);
          if (cover) result.cover = cover;
        } catch {
          // A damaged cover is skipped.
        }
      }
      continue;
    }
    const field = tags[item.type as keyof typeof tags];
    if (!field || result[field] !== undefined) continue;
    try {
      const text = itemText(bytes, item);
      if (text !== undefined) result[field] = text;
    } catch {
      // An undecodable value is skipped; the other tags still count.
    }
  }
  return result;
}

// Title, artist, lyrics and album art from an m4a file's tags. Returns {} for files that
// are not MP4 or have no tags, and never throws: a malformed file yields
// whatever was found before the damage.
export async function readM4aMetadata(file: Blob): Promise<M4aMetadata> {
  try {
    let offset = 0;
    for (let index = 0; index < MAX_TOP_LEVEL_ATOMS && offset + 8 <= file.size; index++) {
      const header = parseHeader(await readBytes(file.slice(offset, offset + 16)), offset, file.size);
      if (!header || (index === 0 && !firstAtoms.has(header.type))) return {};
      if (header.type === "moov") {
        if (header.size > MAX_MOOV_BYTES) return {};
        const body = await readBytes(file.slice(offset + header.headerSize, offset + header.size));
        return parseMoov(body);
      }
      offset += header.size;
    }
  } catch {
    // Unreadable or malformed: nothing found.
  }
  return {};
}
