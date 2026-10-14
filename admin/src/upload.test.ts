import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { deitiesFromPath, expandZips, planItems, slugFromFileName, titleFromFileName, uploadMimeOf } from "./components/panel/files";
import type { AdminApi } from "./api";
import { localizeError } from "./content/localize";
import {
  localizeRowTitles,
  rowFromPlan,
  runUpload,
  uploadsUnavailable,
  withLocalizedTitles,
  type UploadRow,
} from "./pages/content/uploadPipeline";
import type { PanelApi } from "./panelApi";
import { callableError, fakeApi } from "./test/fakeApi";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe("file names", () => {
  it("make readable titles and safe IDs", () => {
    expect(titleFromFileName("01 - shiv_tandav-stotram (HQ).mp3")).toBe("Shiv Tandav Stotram");
    expect(titleFromFileName("hanuman chalisa of tulsidas.wav")).toBe("Hanuman Chalisa of Tulsidas");
    expect(titleFromFileName("OM namah shivaya.m4a")).toBe("OM Namah Shivaya");
    expect(slugFromFileName("01 - Shiv Tāndav (HQ).mp3")).toBe("01-shiv-tandav-hq");
    expect(slugFromFileName("ॐ.mp3")).toBe("item");
  });

  it("know upload types by extension, whatever the browser says", () => {
    expect(uploadMimeOf("song.WAV")).toBe("audio/wav");
    expect(uploadMimeOf("song.m4a")).toBe("audio/mp4");
    expect(uploadMimeOf("photo.jpeg")).toBe("image/jpeg");
    expect(uploadMimeOf("notes.pdf")).toBeNull();
  });
});

describe("planning items", () => {
  it("pairs audio with a same-named cover and explains what is left out", () => {
    const plan = planItems("BHAJAN", [
      file("aarti.mp3"),
      file("Aarti.jpg"),
      file("bhajan.wav"),
      file("lonely-cover.png"),
      file("clip.mp4"),
      file("readme.txt"),
    ]);
    expect(plan.items.map((item) => [item.name, item.extra?.name])).toEqual([
      ["aarti.mp3", "Aarti.jpg"],
      ["bhajan.wav", undefined],
    ]);
    expect(plan.items[0].main.type).toBe("audio/mpeg");
    expect(plan.skipped.map((item) => item.name).sort()).toEqual(["clip.mp4", "lonely-cover.png", "readme.txt"]);
  });

  it("makes one wallpaper per image and one status per video", () => {
    expect(planItems("WALLPAPER", [file("a.png"), file("b.webp")]).items).toHaveLength(2);
    const status = planItems("STATUS", [file("jai.mp4"), file("jai.png")]);
    expect(status.items.map((item) => [item.main.type, item.extra?.type])).toEqual([["video/mp4", "image/png"]]);
  });

  it("refuses files over the size limit", () => {
    const plan = planItems("WALLPAPER", [file("huge.png", 41 * 1024 * 1024)]);
    expect(plan.items).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/40 MB/);
  });

  it("unpacks ZIPs and drops system junk", async () => {
    const zip = zipSync({
      "bhajans/one.mp3": new Uint8Array([1, 2, 3]),
      "bhajans/one.jpg": new Uint8Array([4]),
      "__MACOSX/._one.mp3": new Uint8Array([9]),
      ".DS_Store": new Uint8Array([9]),
    });
    const files = await expandZips([new File([zip as BlobPart], "batch.zip"), file("loose.mp3")]);
    expect(files.map((item) => item.name).sort()).toEqual(["loose.mp3", "one.jpg", "one.mp3"]);
    expect(files.find((item) => item.name === "one.mp3")!.type).toBe("audio/mpeg");
  });
});

describe("deities from folders and file names", () => {
  const deities = [
    { value: "hanuman", label: "Hanuman" },
    { value: "ganesha", label: "Ganesh" },
    { value: "shiva", label: "Shiv" },
    { value: "parvati", label: "Parvati" },
  ];
  it("reads the folder, else the file name, on whole words only", async () => {
    const zip = zipSync({
      "wallpapers/Hanuman/04.png": new Uint8Array([1]),
      "Shiv Parvati/dawn.png": new Uint8Array([1]),
      "misc/ganesh_02.jpg": new Uint8Array([1]),
      "misc/shivalik-hills.jpg": new Uint8Array([1]),
    });
    const files = await expandZips([new File([zip as BlobPart], "batch.zip")]);
    const of = (name: string) => deitiesFromPath(files.find((item) => item.name === name)!, deities);
    expect(of("04.png")).toEqual(["hanuman"]);
    expect(of("dawn.png")).toEqual(["shiva", "parvati"]);
    expect(of("ganesh_02.jpg")).toEqual(["ganesha"]);
    expect(of("shivalik-hills.jpg")).toEqual([]);
    expect(deitiesFromPath(file("loose.png"), deities)).toEqual([]);
  });
});

const panelWith = (processMedia: PanelApi["processMedia"]) => ({ processMedia }) as unknown as PanelApi;
const defaults = { deityIds: ["shiva"], audioLanguage: "hi", aiTool: "Suno", aiPlan: "Pro", markReady: false };

describe("upload pipeline", () => {
  const plan = planItems("BHAJAN", [file("shiv-tandav.mp3", 300), file("shiv-tandav.jpg", 100)]);

  it("creates the draft, uploads both files and renders them onto it", async () => {
    let n = 0;
    const api = fakeApi({
      createContent: vi
        .fn()
        .mockRejectedValueOnce(callableError("already-exists", "taken"))
        .mockResolvedValue({ id: "x", status: "DRAFT", problems: [] }),
      requestUploadUrl: vi.fn(async ({ contentType }) => ({ key: `staging/k${++n}.${contentType}`, url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })),
    });
    const processMedia = vi.fn(async () => ({ media: { stream: { key: "bhajan/a/stream.m4a" } }, warnings: [], durationSeconds: 300 }));
    let row: UploadRow = rowFromPlan(plan.items[0]);
    await runUpload(row, { api, panel: panelWith(processMedia), type: "BHAJAN", defaults, taken: new Set(), check: async () => null }, (patch) => (row = { ...row, ...patch }));

    expect(row.stage).toBe("done");
    expect(row.contentId).toBe("shiv-tandav-2");
    const draft = vi.mocked(api.createContent).mock.calls[1][1];
    expect(draft.title).toEqual({ hi: "", en: "Shiv Tandav" });
    expect(draft.deityIds).toEqual(["shiva"]);
    expect(draft.audioLanguage).toBe("hi");
    expect(draft.private.aiTool).toBe("Suno");
    expect(processMedia).toHaveBeenCalledWith({
      contentId: "shiv-tandav-2",
      inputs: { audio: "staging/k1.audio/mpeg", image: "staging/k2.image/jpeg" },
    });
    expect(row.durationSeconds).toBe(300);
  });

  it("uses the deity a folder names, and marks the item READY when asked", async () => {
    const zip = zipSync({ "hanuman/04.png": new Uint8Array([1]) });
    const [image] = await expandZips([new File([zip as BlobPart], "w.zip")]);
    const wallpaper = planItems("WALLPAPER", [image]).items[0];
    const api = fakeApi({ requestUploadUrl: vi.fn(async () => ({ key: "staging/k.png", url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })) });
    const processMedia = vi.fn(async () => ({ media: { thumb: { key: "wallpaper/a/thumb.webp" } }, warnings: [], durationSeconds: null }));
    let row: UploadRow = rowFromPlan(wallpaper);
    const deities = [{ value: "hanuman", label: "Hanuman" }];
    await runUpload(row, { api, panel: panelWith(processMedia), type: "WALLPAPER", defaults: { ...defaults, markReady: true }, taken: new Set(), deities, check: async () => null }, (patch) => (row = { ...row, ...patch }));
    expect(vi.mocked(api.createContent).mock.calls[0][1].deityIds).toEqual(["hanuman"]);
    expect(api.transitionContent).toHaveBeenCalledWith({ contentId: row.contentId, to: "READY" });
    expect(row).toMatchObject({ stage: "done", ready: true });
  });

  it("keeps the draft and says why when READY is refused", async () => {
    const api = fakeApi({
      requestUploadUrl: vi.fn(async () => ({ key: "staging/k.png", url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })),
      transitionContent: vi.fn().mockRejectedValue(callableError("failed-precondition", "Some required fields are missing.")),
    });
    const processMedia = vi.fn(async () => ({ media: {}, warnings: [], durationSeconds: null }));
    let row: UploadRow = rowFromPlan(planItems("WALLPAPER", [file("a.png")]).items[0]);
    await runUpload(row, { api, panel: panelWith(processMedia), type: "WALLPAPER", defaults: { ...defaults, deityIds: [], markReady: true }, taken: new Set(), check: async () => null }, (patch) => (row = { ...row, ...patch }));
    expect(row.stage).toBe("done");
    expect(row.ready).toBe(false);
    expect(row.warnings.join(" ")).toMatch(/Kept as a draft/);
  });

  it("leaves the audio language unset when the batch says so", async () => {
    const api = fakeApi({ requestUploadUrl: vi.fn(async () => ({ key: "staging/k.mp3", url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })) });
    let row: UploadRow = rowFromPlan(plan.items[0]);
    const processMedia = vi.fn(async () => ({ media: {}, warnings: [], durationSeconds: null }));
    await runUpload(row, { api, panel: panelWith(processMedia), type: "BHAJAN", defaults: { ...defaults, audioLanguage: "none" }, taken: new Set(), check: async () => null }, (patch) => (row = { ...row, ...patch }));
    expect(vi.mocked(api.createContent).mock.calls[0][1].audioLanguage).toBeUndefined();
  });

  it("stops on a failure and resumes without creating the draft again", async () => {
    const api = fakeApi({
      requestUploadUrl: vi.fn(async () => ({ key: "staging/k.mp3", url: "u", method: "PUT" as const, headers: {}, expiresAt: "" })),
      putFile: vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue(undefined),
    });
    const processMedia = vi.fn(async () => ({ media: { stream: { key: "bhajan/a/s.m4a" } }, warnings: [], durationSeconds: null }));
    let row: UploadRow = rowFromPlan(plan.items[0]);
    const deps = { api, panel: panelWith(processMedia), type: "BHAJAN" as const, defaults, taken: new Set<string>(), check: async () => null };
    await runUpload(row, deps, (patch) => (row = { ...row, ...patch }));
    expect(row.stage).toBe("error");
    expect(row.contentId).toBe("shiv-tandav");
    await runUpload(row, deps, (patch) => (row = { ...row, ...patch }));
    expect(row.stage).toBe("done");
    expect(api.createContent).toHaveBeenCalledTimes(1);
  });

  it("a file that breaks the rules never creates a draft", async () => {
    const api = fakeApi();
    let row: UploadRow = rowFromPlan(plan.items[0]);
    await runUpload(row, { api, panel: panelWith(vi.fn()), type: "RINGTONE", defaults, taken: new Set(), check: async () => "Ringtones must be 20–30 seconds; this one is 5 s." }, (patch) => (row = { ...row, ...patch }));
    expect(row.stage).toBe("error");
    expect(row.error).toMatch(/20–30/);
    expect(api.createContent).not.toHaveBeenCalled();
  });

  it("checks the server is set up before creating anything", async () => {
    const notFound = callableError("not-found", "no such item");
    const api = fakeApi({ requestUploadUrl: vi.fn(async () => Promise.reject(callableError("failed-precondition", "Media uploads are not configured"))) });
    expect(await uploadsUnavailable(api, panelWith(vi.fn()))).toMatch(/not set up/);
    const ready = fakeApi({ requestUploadUrl: vi.fn(async () => Promise.reject(notFound)) });
    expect(await uploadsUnavailable(ready, panelWith(vi.fn(async () => Promise.reject(notFound))))).toBeNull();
    expect(api.createContent).not.toHaveBeenCalled();
  });
});

describe("Gemini titles on the upload page", () => {
  const rows = (titles: [string, string][]): UploadRow[] =>
    titles.map(([en, hi], index) => ({
      ...rowFromPlan(planItems("BHAJAN", [file(`song-${index}.mp3`)]).items[0]),
      title: { en, hi },
    }));
  // What the page does: ask, then apply the answers to the latest rows.
  const fill = async (api: AdminApi, current: UploadRow[]) => {
    const answers = await localizeRowTitles(api, current);
    return withLocalizedTitles(current, answers);
  };

  it("starts Devanagari file names on the Hindi side", () => {
    const [hindi, english] = planItems("BHAJAN", [file("राम_का_नाम_लिए_जा.mp3"), file("om-jai-jagdish-hare.mp3")]).items.map(rowFromPlan);
    expect(hindi.title).toEqual({ hi: "राम का नाम लिए जा", en: "" });
    expect(english.title).toEqual({ hi: "", en: "Om Jai Jagdish Hare" });
  });

  it("sends rows with one empty side and puts each answer on the right side", async () => {
    const api = fakeApi();
    const before = rows([
      ["Om Jai Jagdish Hare", ""],
      ["", "राम का नाम लिए जा"],
      ["Hanuman Chalisa", "हनुमान चालीसा"],
      ["", ""],
    ]);
    const { count, rows: after } = await fill(api, before);
    expect(api.localizeText).toHaveBeenCalledTimes(1);
    expect(api.localizeText).toHaveBeenCalledWith({ kind: "title", items: ["Om Jai Jagdish Hare", "राम का नाम लिए जा"] });
    expect(count).toBe(2);
    expect(after.map((row) => row.title)).toEqual([
      { en: "Om Jai Jagdish Hare", hi: "हिन्दी Om Jai Jagdish Hare" },
      { en: "Hinglish 17", hi: "राम का नाम लिए जा" },
      { en: "Hanuman Chalisa", hi: "हनुमान चालीसा" },
      { en: "", hi: "" },
    ]);
    // Rows with both sides (or none) are left exactly as they were.
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it("moves a Hindi title read from the file name to the Hindi side", async () => {
    const api = fakeApi({
      localizeText: vi.fn(async () => [{ language: "hi" as const, hi: "ॐ नमः शिवाय", en: "Om Namah Shivay" }]),
    });
    const { rows: after } = await fill(api, rows([["ॐ नमः शिवाय", ""]]));
    expect(after[0].title).toEqual({ hi: "ॐ नमः शिवाय", en: "Om Namah Shivay" });
  });

  it("never overwrites a side the editor typed into", async () => {
    const api = fakeApi({
      localizeText: vi.fn(async () => [{ language: "hi" as const, hi: "ॐ नमः शिवाय", en: "Om Namah Shivay" }]),
    });
    // Typed Devanagari into the English box: it stays, nothing moves.
    const [typed] = rows([["ॐ नमः शिवाय", ""]]);
    const { count, rows: after } = await fill(api, [{ ...typed, typed: { en: true } }]);
    expect(count).toBe(0);
    expect(after[0].title).toEqual({ hi: "", en: "ॐ नमः शिवाय" });
  });

  it("keeps titles typed while Gemini was working", async () => {
    const before = rows([["Hanuman Chalisa", ""], ["Aarti", ""], ["Bhajan", ""]]);
    const answers = await localizeRowTitles(fakeApi(), before);
    // Meanwhile: a Hindi title typed for row 1, the English title edited for row 2.
    const edited = [
      { ...before[0], title: { en: "Hanuman Chalisa", hi: "मेरा शीर्षक" }, typed: { hi: true } },
      { ...before[1], title: { en: "Aarti Sangrah", hi: "" }, typed: { en: true } },
      before[2],
    ];
    const result = withLocalizedTitles(edited, answers);
    expect(result.count).toBe(1);
    expect(result.rows[0]).toBe(edited[0]);
    expect(result.rows[1]).toBe(edited[1]);
    expect(result.rows[2].title).toEqual({ en: "Bhajan", hi: "हिन्दी Bhajan" });
  });

  it("skips rows mid-upload and marks uploaded drafts as unsaved", async () => {
    const api = fakeApi();
    const [busy, done, waiting] = rows([["A", ""], ["B", ""], ["C", ""]]);
    const { rows: after } = await fill(api, [
      { ...busy, stage: "uploading" },
      { ...done, stage: "done", contentId: "b" },
      waiting,
    ]);
    expect(api.localizeText).toHaveBeenCalledWith({ kind: "title", items: ["B", "C"] });
    expect(after[0].title.hi).toBe("");
    expect(after[1]).toMatchObject({ title: { hi: "हिन्दी B" }, titleUnsaved: true });
    expect(after[2].titleUnsaved).toBeUndefined();
  });

  it("asks for at most 50 titles per call and reports progress", async () => {
    const api = fakeApi();
    const many = rows(Array.from({ length: 120 }, (_, index): [string, string] => [`Bhajan ${index}`, ""]));
    const progress: number[] = [];
    const answers = await localizeRowTitles(api, many, (done) => progress.push(done));
    const sizes = vi.mocked(api.localizeText).mock.calls.map(([input]) => input.items.length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(progress).toEqual([50, 100, 120]);
    expect(withLocalizedTitles(many, answers).count).toBe(120);
  });

  it("changes nothing when a call fails", async () => {
    let calls = 0;
    const api = fakeApi({
      localizeText: vi.fn(async ({ items }: { items: string[] }) => {
        calls += 1;
        if (calls > 1) throw callableError("unavailable", "Gemini could not be reached. Try again in a minute.");
        return items.map((en) => ({ language: "en" as const, en, hi: `हि ${en}` }));
      }),
    });
    const before = rows(Array.from({ length: 60 }, (_, index): [string, string] => [`T${index}`, ""]));
    await expect(localizeRowTitles(api, before)).rejects.toMatchObject({ code: "functions/unavailable" });
    expect(before.every((row) => row.title.hi === "")).toBe(true);
  });

  it("explains errors in plain words, including a missing configuration", () => {
    expect(localizeError(callableError("failed-precondition", "Gemini is not configured."))).toMatch(
      /Gemini is not configured on this server/,
    );
    expect(localizeError(callableError("internal", 'Gemini could not convert "Aarti". Try again or type it in.'))).toBe(
      'Gemini could not convert "Aarti". Try again or type it in.',
    );
    expect(localizeError(callableError("permission-denied", "Your role (ANALYST) cannot do this."))).toBe(
      "Your role (ANALYST) cannot do this.",
    );
  });
});
