// ---- A tiny MP4 writer for tests: atoms are built in memory, no binaries committed.
export const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
export const utf8 = (text: string) => new TextEncoder().encode(text);
export const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};
export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
// An atom with a 32-bit size; `type` is four Latin-1 characters ("©lyr").
export const atom = (type: string, ...body: Uint8Array[]) => {
  const content = concat(...body);
  return concat(u32(8 + content.length), latin1(type), content);
};
// The same atom with size = 1 and a 64-bit size after the type.
export const atom64 = (type: string, ...body: Uint8Array[]) => {
  const content = concat(...body);
  return concat(u32(1), latin1(type), u32(0), u32(16 + content.length), content);
};
export const text = (type: string, value: string) => atom(type, atom("data", u32(1), u32(0), utf8(value)));
// A covr item with one data atom per image (type 13 = JPEG, 14 = PNG).
export const covr = (...images: [number, Uint8Array][]) =>
  atom("covr", ...images.map(([type, bytes]) => atom("data", u32(type), u32(0), bytes)));
export const ftyp = atom("ftyp", latin1("M4A "), u32(0), latin1("M4A isommp42"));
export const mdat = atom("mdat", new Uint8Array(4096).fill(0x55));
export const hdlr = atom("hdlr", u32(0), u32(0), latin1("mdirappl"), new Uint8Array(9));
export const moov = (...items: Uint8Array[]) =>
  atom(
    "moov",
    atom("mvhd", new Uint8Array(100)),
    atom("trak", atom("tkhd", new Uint8Array(84))),
    atom("udta", atom("meta", u32(0), hdlr, atom("ilst", ...items))),
  );
export const m4aBlob = (...atoms: Uint8Array[]) => new Blob([concat(...atoms) as BlobPart], { type: "audio/mp4" });

export const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
export const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

// An .m4a File with the given tags (cover: [type code, bytes]).
export function m4aFile(
  name: string,
  tags: { title?: string; lyrics?: string; cover?: [number, Uint8Array] } = {},
): File {
  const items = [
    ...(tags.title ? [text("©nam", tags.title)] : []),
    ...(tags.lyrics ? [text("©lyr", tags.lyrics)] : []),
    ...(tags.cover ? [covr(tags.cover)] : []),
  ];
  return new File([concat(ftyp, mdat, moov(...items)) as BlobPart], name, { type: "audio/mp4" });
}
