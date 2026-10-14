import { describe, expect, it } from "vitest";
import { cleanLyricsForDisplay, readM4aMetadata } from "./m4aMetadata";

// ---- A tiny MP4 writer: atoms are built in memory, no binaries committed.
const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const utf8 = (text: string) => new TextEncoder().encode(text);
const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
// An atom with a 32-bit size; `type` is four Latin-1 characters ("©lyr").
const atom = (type: string, ...body: Uint8Array[]) => {
  const content = concat(...body);
  return concat(u32(8 + content.length), latin1(type), content);
};
// The same atom with size = 1 and a 64-bit size after the type.
const atom64 = (type: string, ...body: Uint8Array[]) => {
  const content = concat(...body);
  return concat(u32(1), latin1(type), u32(0), u32(16 + content.length), content);
};
const text = (type: string, value: string) =>
  atom(type, atom("data", u32(1), u32(0), utf8(value)));
const ftyp = atom("ftyp", latin1("M4A "), u32(0), latin1("M4A isommp42"));
const mdat = atom("mdat", new Uint8Array(4096).fill(0x55));
const hdlr = atom("hdlr", u32(0), u32(0), latin1("mdirappl"), new Uint8Array(9));
const moov = (...items: Uint8Array[]) =>
  atom(
    "moov",
    atom("mvhd", new Uint8Array(100)),
    atom("trak", atom("tkhd", new Uint8Array(84))),
    atom("udta", atom("meta", u32(0), hdlr, atom("ilst", ...items))),
  );
const file = (...atoms: Uint8Array[]) => new Blob([concat(...atoms)], { type: "audio/mp4" });

const hindiLyrics = "[Intro — Female Lead]\r\nसखी री, आँगन सजा दो,\r\nआज हनुमत का गुण गाएँ।";
const tags = [
  text("©nam", "मेरे आँगन भजन की रात"),
  text("©ART", "Bhaktara"),
  text("©lyr", hindiLyrics),
];

describe("readM4aMetadata", () => {
  it("reads Devanagari title, artist and lyrics when moov follows mdat", async () => {
    const uuid = atom("uuid", new Uint8Array(16));
    const free = atom("free", new Uint8Array(8));
    expect(await readM4aMetadata(file(ftyp, uuid, free, mdat, moov(...tags)))).toEqual({
      title: "मेरे आँगन भजन की रात",
      artist: "Bhaktara",
      lyrics: "[Intro — Female Lead]\nसखी री, आँगन सजा दो,\nआज हनुमत का गुण गाएँ।",
    });
  });

  it("reads tags when moov comes before mdat, even if mdat runs to the end (size 0)", async () => {
    const openMdat = concat(u32(0), latin1("mdat"), new Uint8Array(512));
    expect(await readM4aMetadata(file(ftyp, moov(...tags), openMdat))).toMatchObject({
      title: "मेरे आँगन भजन की रात",
      artist: "Bhaktara",
    });
  });

  it("follows 64-bit atom sizes", async () => {
    const bigMdat = atom64("mdat", new Uint8Array(2048));
    const body = atom64("moov", atom("udta", atom("meta", u32(0), hdlr, atom("ilst", text("©nam", "Aarti")))));
    expect(await readM4aMetadata(file(ftyp, bigMdat, body))).toEqual({ title: "Aarti" });
  });

  it("returns {} when there is no ilst", async () => {
    const bare = atom("moov", atom("mvhd", new Uint8Array(100)), atom("udta", atom("meta", u32(0), hdlr)));
    expect(await readM4aMetadata(file(ftyp, mdat, bare))).toEqual({});
    expect(await readM4aMetadata(file(ftyp, mdat))).toEqual({});
  });

  it("returns {} for files that are not MP4", async () => {
    expect(await readM4aMetadata(new Blob([utf8("ID3\u0003 this is an mp3 file, not mp4")]))).toEqual({});
    expect(await readM4aMetadata(new Blob([]))).toEqual({});
    expect(await readM4aMetadata(new Blob([new Uint8Array([0, 0, 0, 1])]))).toEqual({});
  });

  it("never throws on damaged files and keeps what it found", async () => {
    // A broken item after ©ART claims 9999 bytes: the walk stops there.
    const damaged = atom("ilst", text("©ART", "Bhaktara"), u32(9999), latin1("©nam"));
    const body = atom("moov", atom("udta", atom("meta", u32(0), hdlr, damaged)));
    expect(await readM4aMetadata(file(ftyp, body))).toEqual({ artist: "Bhaktara" });
    const truncated = concat(ftyp, moov(...tags)).slice(0, 200);
    expect(await readM4aMetadata(new Blob([truncated]))).toEqual({});
  });
});

describe("cleanLyricsForDisplay", () => {
  const sample = `[Intro — Female Lead]
सखी री, आँगन सजा दो,
आज हनुमत का गुण गाएँ।

[Chorus — Lead and Female Group]
मेरे आँगन भजन की रात,
आओ सखियों, बजाओ ताली।`;

  it("drops section notes and splits stanzas on blank lines", () => {
    expect(cleanLyricsForDisplay(sample)).toEqual([
      ["सखी री, आँगन सजा दो,", "आज हनुमत का गुण गाएँ।"],
      ["मेरे आँगन भजन की रात,", "आओ सखियों, बजाओ ताली।"],
    ]);
  });

  it("handles en dashes, hyphens, CRLF, extra spaces and empty stanzas", () => {
    const text = "  [Intro – Soft Chant]  \r\n  ॐ नमः शिवाय  \r\n\r\n\r\n[Verse 1 - Antara]\r\n[Chorus — Mukhda]\r\n\r\nहर हर महादेव\n";
    expect(cleanLyricsForDisplay(text)).toEqual([["ॐ नमः शिवाय"], ["हर हर महादेव"]]);
    expect(cleanLyricsForDisplay("")).toEqual([]);
    expect(cleanLyricsForDisplay("[Outro]\n\n")).toEqual([]);
  });
});
