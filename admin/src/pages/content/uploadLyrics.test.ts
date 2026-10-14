import { describe, expect, it, vi } from "vitest";
import { planItems } from "../../components/panel/files";
import type { ContentType } from "../../domain";
import type { PanelApi } from "../../panelApi";
import { callableError, fakeApi } from "../../test/fakeApi";
import { jpegBytes, m4aFile, pngBytes } from "../../test/m4a";
import {
  coverFile,
  eachLimit,
  localizeRowLyrics,
  needsLocalizing,
  needsLyrics,
  readRowTags,
  replanRow,
  rowFromPlan,
  runUpload,
  saveRowText,
  withLocalizedLyrics,
  withTags,
  type UploadRow,
} from "./uploadPipeline";

const hindiLyrics = "[Intro — Female Lead]\nसखी री, आँगन सजा दो,\nआज हनुमत का गुण गाएँ।";
const hinglishLyrics = "[Chorus]\nSakhi ri, aangan saja do,\naaj Hanumat ka gun gaayen.";

// The rows the page makes for these files.
const rowsFor = (files: File[], type: ContentType = "BHAJAN") => planItems(type, files).items.map(rowFromPlan);

// What the page does after files are added: read the tags, apply each.
async function readTags(rows: UploadRow[], type: ContentType = "BHAJAN") {
  let latest = rows;
  await readRowTags(rows, (key, file, tags) => {
    latest = latest.map((row) => (row.key === key ? withTags(row, file, tags, type) : row));
  });
  return latest;
}

describe("m4a tags on the upload page", () => {
  it("uses the title tag instead of the file name, on its script's side", async () => {
    const rows = rowsFor([
      m4aFile("01-track.m4a", { title: "मेरे आँगन भजन की रात" }),
      m4aFile("02-track.m4a", { title: "Om Jai Jagdish Hare" }),
      m4aFile("no-tags.m4a"),
    ]);
    // Gemini waits for the tags of an m4a.
    expect(rows.every((row) => !needsLocalizing(row))).toBe(true);
    const after = await readTags(rows);
    expect(after.map((row) => row.title)).toEqual([
      { hi: "मेरे आँगन भजन की रात", en: "" },
      { hi: "", en: "Om Jai Jagdish Hare" },
      { hi: "", en: "No Tags" },
    ]);
    expect(after.every((row) => row.tagsRead && needsLocalizing(row))).toBe(true);
  });

  it("never replaces a title the editor typed", async () => {
    const [row] = rowsFor([m4aFile("song.m4a", { title: "Aarti" })]);
    const typed = { ...row, title: { hi: "", en: "My title" }, typed: { en: true } };
    const [after] = await readTags([typed]);
    expect(after.title).toEqual({ hi: "", en: "My title" });
  });

  it("puts tag lyrics on their script's side", async () => {
    const [hindi, hinglish] = await readTags(
      rowsFor([m4aFile("a.m4a", { lyrics: hindiLyrics }), m4aFile("b.m4a", { lyrics: hinglishLyrics })]),
    );
    expect(hindi.lyrics).toEqual({ hi: hindiLyrics, en: "" });
    expect(hinglish.lyrics).toEqual({ hi: "", en: hinglishLyrics });
    // Ringtones carry no lyrics.
    const [ringtone] = await readTags(rowsFor([m4aFile("r.m4a", { lyrics: hindiLyrics })], "RINGTONE"), "RINGTONE");
    expect(ringtone.lyrics).toEqual({ hi: "", en: "" });
  });

  it("reads at most 4 files at a time and treats a failed read as no tags", async () => {
    const rows = rowsFor(Array.from({ length: 10 }, (_, index) => m4aFile(`s${index}.m4a`)));
    let inFlight = 0;
    let most = 0;
    const applied: string[] = [];
    await readRowTags(
      rows,
      (key) => applied.push(key),
      async (file) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        if ((file as File).name === "s3.m4a") throw new Error("unreadable");
        return {};
      },
    );
    expect(most).toBe(4);
    expect(applied).toHaveLength(10);
  });
});

describe("album art from m4a files", () => {
  it("becomes the row's cover image when none is attached, with the right type and name", async () => {
    const [jpeg, png] = await readTags(
      rowsFor([m4aFile("Shiv Aarti.m4a", { cover: [13, jpegBytes] }), m4aFile("ganesh.m4a", { cover: [14, pngBytes] })]),
    );
    expect(jpeg.coverFromFile).toBe(true);
    expect(jpeg.extra).toMatchObject({ name: "shiv-aarti-cover.jpg", type: "image/jpeg", size: jpegBytes.length });
    expect(png.extra).toMatchObject({ name: "ganesh-cover.png", type: "image/png" });
    expect(new Uint8Array(await png.extra!.arrayBuffer())).toEqual(pngBytes);
  });

  it("never replaces an image the operator attached", async () => {
    const attached = new File([new Uint8Array(5)], "song.jpg", { type: "image/jpeg" });
    const [row] = await readTags(rowsFor([m4aFile("song.m4a", { cover: [13, jpegBytes] }), attached]));
    expect(row.extra?.name).toBe("song.jpg");
    expect(row.coverFromFile).toBeUndefined();
    // Attaching one later replaces the album art.
    const [withArt] = await readTags(rowsFor([m4aFile("song.m4a", { cover: [13, jpegBytes] })]));
    const replanned = replanRow(planItems("BHAJAN", [withArt.main, attached]).items[0], withArt);
    expect(replanned.extra?.name).toBe("song.jpg");
    expect(replanned.coverFromFile).toBeFalsy();
    // Adding unrelated files keeps the album art, title and lyrics.
    const kept = replanRow(planItems("BHAJAN", [withArt.main]).items[0], { ...withArt, lyrics: { hi: "भजन", en: "" } });
    expect(kept).toMatchObject({ extra: { name: "song-cover.jpg" }, coverFromFile: true, tagsRead: true, lyrics: { hi: "भजन" } });
  });

  it("skips covers over the image size limit", () => {
    const huge = { length: 41 * 1024 * 1024 } as unknown as Uint8Array;
    expect(coverFile({ id: "x" }, { mime: "image/jpeg", bytes: huge })).toBeNull();
  });

  it("is uploaded as the image and the lyrics go into the draft", async () => {
    const [row] = await readTags(rowsFor([m4aFile("aarti.m4a", { lyrics: hindiLyrics, cover: [13, jpegBytes] })]));
    let n = 0;
    const api = fakeApi({
      requestUploadUrl: vi.fn(async ({ contentType }) => ({ key: `staging/k${++n}.${contentType}`, url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })),
    });
    const processMedia = vi.fn(async () => ({ media: {}, warnings: [], durationSeconds: 60 }));
    const panel = { processMedia } as unknown as PanelApi;
    const defaults = { deityIds: [], audioLanguage: "hi", aiTool: "", aiPlan: "", markReady: false };
    await runUpload(row, { api, panel, type: "BHAJAN", defaults, taken: new Set(), check: async () => null }, () => {});
    expect(vi.mocked(api.createContent).mock.calls[0][1].lyrics).toEqual({ hi: hindiLyrics, en: "" });
    expect(processMedia).toHaveBeenCalledWith({
      contentId: "aarti",
      inputs: { audio: "staging/k1.audio/mp4", image: "staging/k2.image/jpeg" },
    });
  });
});

describe("Hinglish lyrics on the upload page", () => {
  const tagged = async (lyrics: string) => (await readTags(rowsFor([m4aFile("song.m4a", { lyrics })])))[0];

  it("fills the other side of tag lyrics with one lyrics call per row", async () => {
    const api = fakeApi();
    const hindi = await tagged(hindiLyrics);
    const answer = await localizeRowLyrics(api, hindi);
    expect(api.localizeText).toHaveBeenCalledWith({ kind: "lyrics", items: [hindiLyrics] });
    expect(withLocalizedLyrics(hindi, answer)?.lyrics).toEqual({ hi: hindiLyrics, en: `Hinglish ${hindiLyrics.length}` });

    const hinglish = await tagged(hinglishLyrics);
    const back = withLocalizedLyrics(hinglish, await localizeRowLyrics(api, hinglish));
    expect(back?.lyrics).toEqual({ hi: `हिन्दी ${hinglishLyrics}`, en: hinglishLyrics });
    expect(back?.lyricsUnsaved).toBeFalsy();
  });

  it("never overwrites typed lyrics or lyrics edited during the call", async () => {
    const api = fakeApi();
    const row = await tagged(hindiLyrics);
    const answer = await localizeRowLyrics(api, row);
    // Typed into the Hinglish side meanwhile.
    expect(withLocalizedLyrics({ ...row, lyrics: { hi: hindiLyrics, en: "mine" }, lyricsTyped: { en: true } }, answer)).toBeNull();
    // Edited the Hindi lyrics meanwhile.
    expect(withLocalizedLyrics({ ...row, lyrics: { hi: "नया", en: "" }, lyricsTyped: { hi: true } }, answer)).toBeNull();
    // Hindi typed into the Hinglish box stays there.
    const misplaced = { ...row, lyrics: { hi: "", en: hindiLyrics }, lyricsTyped: { en: true } };
    const moved = await localizeRowLyrics(api, misplaced);
    expect(withLocalizedLyrics(misplaced, moved)).toBeNull();
  });

  it("marks uploaded rows unsaved so they offer Save, which stores the lyrics", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => ({ id: "song", status: "DRAFT" as const, updatedAt: "", scheduledAt: null, publishedAt: null, draft: { title: { hi: "", en: "Song" } } as never })),
    });
    const row = { ...(await tagged(hindiLyrics)), stage: "done" as const, contentId: "song" };
    const next = withLocalizedLyrics(row, await localizeRowLyrics(api, row))!;
    expect(next.lyricsUnsaved).toBe(true);
    await saveRowText(api, "song", { title: next.title, lyrics: next.lyrics });
    expect(vi.mocked(api.updateContent).mock.calls[0][1]).toMatchObject({ lyrics: { hi: hindiLyrics, en: `Hinglish ${hindiLyrics.length}` } });
  });

  it("leaves the row unchanged when the call fails", async () => {
    const api = fakeApi({ localizeText: vi.fn(async () => Promise.reject(callableError("unavailable", "Gemini could not be reached."))) });
    const row = await tagged(hindiLyrics);
    const before = structuredClone({ lyrics: row.lyrics, title: row.title });
    await expect(localizeRowLyrics(api, row)).rejects.toMatchObject({ code: "functions/unavailable" });
    expect({ lyrics: row.lyrics, title: row.title }).toEqual(before);
  });

  it("asks nothing for rows whose lyrics have both sides, no lyrics, or unread tags", async () => {
    const api = fakeApi();
    const [plain] = rowsFor([new File([new Uint8Array(4)], "song.mp3")]);
    const both = { ...plain, lyrics: { hi: hindiLyrics, en: hinglishLyrics } };
    const [unread] = rowsFor([m4aFile("song.m4a", { lyrics: hindiLyrics })]);
    const candidates = [both, plain, { ...unread, lyrics: { hi: hindiLyrics, en: "" } }, { ...plain, lyrics: { hi: "भजन", en: "" }, stage: "uploading" as const }];
    expect(candidates.filter((row) => needsLyrics(row, "BHAJAN"))).toEqual([]);
    expect(needsLyrics({ ...plain, lyrics: { hi: "भजन", en: "" } }, "WALLPAPER")).toBe(false);
    expect(needsLyrics({ ...plain, lyrics: { hi: "भजन", en: "" } }, "BHAJAN")).toBe(true);
    await eachLimit(candidates.filter((row) => needsLyrics(row, "BHAJAN")), 2, async (row) => {
      await localizeRowLyrics(api, row);
    });
    expect(api.localizeText).not.toHaveBeenCalled();
  });
});
