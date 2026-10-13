import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { deitiesFromPath, expandZips, planItems, slugFromFileName, titleFromFileName, uploadMimeOf } from "./components/panel/files";
import { rowFromPlan, runUpload, uploadsUnavailable, type UploadRow } from "./pages/content/uploadPipeline";
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
