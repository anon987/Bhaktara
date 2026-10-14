import { describe, expect, it } from "vitest";
import { cleanLyricsForDisplay, readM4aMetadata } from "./m4aMetadata";
import { atom, atom64, concat, covr, ftyp, hdlr, jpegBytes, latin1, m4aBlob, mdat, moov, pngBytes, text, u32, utf8 } from "../test/m4a";

const file = m4aBlob;

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

describe("album art", () => {
  it("reads a JPEG cover (type 13) next to the other tags", async () => {
    const result = await readM4aMetadata(file(ftyp, mdat, moov(...tags, covr([13, jpegBytes]))));
    expect(result.title).toBe("मेरे आँगन भजन की रात");
    expect(result.cover?.mime).toBe("image/jpeg");
    expect([...result.cover!.bytes]).toEqual([...jpegBytes]);
  });

  it("reads a PNG cover (type 14) and takes the first of several", async () => {
    const result = await readM4aMetadata(file(ftyp, moov(covr([14, pngBytes], [13, jpegBytes]), text("©nam", "Aarti")), mdat));
    expect(result).toMatchObject({ title: "Aarti", cover: { mime: "image/png" } });
    expect([...result.cover!.bytes]).toEqual([...pngBytes]);
  });

  it("has no cover when there is no covr atom or its data is not an image", async () => {
    expect((await readM4aMetadata(file(ftyp, mdat, moov(...tags)))).cover).toBeUndefined();
    const unknown = await readM4aMetadata(file(ftyp, mdat, moov(covr([1, utf8("not an image")]))));
    expect(unknown).toEqual({});
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
