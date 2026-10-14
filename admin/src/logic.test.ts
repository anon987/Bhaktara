import { describe, expect, it } from "vitest";
import { librarySections, parseHash, sectionForType } from "./app/router";
import { readConfig } from "./config";
import {
  draftFromForm,
  editorReadiness,
  emptyForm,
  formFromDraft,
  generateContentId,
  validateForm,
} from "./content/draftForm";
import { readableError } from "./errors";
import { contentTypes } from "./domain";
import { callableError } from "./test/fakeApi";
import { distinctTags, withoutUndefined } from "./panelApi";
import { audioVariant, clock } from "./components/panel/preview";

describe("readConfig", () => {
  it("defaults to the emulators with the demo project", () => {
    const config = readConfig({});
    expect(config.firebase.projectId).toBe("demo-bhaktara");
    expect(config.emulators).toEqual({
      host: "127.0.0.1",
      authPort: 9099,
      firestorePort: 8080,
      functionsPort: 5001,
    });
    expect(config.functionsRegion).toBe("asia-south1");
  });

  it("refuses a real project ID in emulator mode", () => {
    expect(() => readConfig({ VITE_FIREBASE_PROJECT_ID: "bhaktara-dev" })).toThrow(/demo-/);
  });

  it("needs the full web config outside the emulators", () => {
    expect(() => readConfig({ VITE_USE_EMULATORS: "false" })).toThrow(/apiKey/);
    expect(() =>
      readConfig({
        VITE_USE_EMULATORS: "false",
        VITE_FIREBASE_API_KEY: "k",
        VITE_FIREBASE_AUTH_DOMAIN: "d",
        VITE_FIREBASE_PROJECT_ID: "demo-bhaktara",
      }),
    ).toThrow(/emulators/);
    const config = readConfig({
      VITE_USE_EMULATORS: "false",
      VITE_FIREBASE_API_KEY: "k",
      VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "example",
    });
    expect(config.emulators).toBeNull();
  });
});

describe("readableError", () => {
  it("explains missing upload configuration", () => {
    const error = readableError(
      callableError("failed-precondition", "Media uploads are not configured for this environment."),
    );
    expect(error.kind).toBe("uploads-unconfigured");
    expect(error.message).toMatch(/R2/);
  });

  it("maps zod issues to field problems", () => {
    const error = readableError(
      callableError("invalid-argument", "Some fields are invalid.", {
        issues: [{ path: "draft.title.hi", message: "Too big" }],
      }),
    );
    expect(error.problems).toEqual([{ field: "draft.title.hi", message: "Too big" }]);
  });

  it("treats Firestore rule denials as an access problem", () => {
    const error = readableError(
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      }),
    );
    expect(error.message).toMatch(/Refresh access/);
  });
});

describe("draft form", () => {
  it("round-trips a draft and keeps variant metadata for unchanged keys", () => {
    const form = emptyForm("WALLPAPER");
    form.title = { hi: "शिव", en: "Shiva" };
    form.media.thumb = {
      key: "wallpaper/s/thumb.abcd1234.webp",
      original: { key: "wallpaper/s/thumb.abcd1234.webp", bytes: 10 },
    };
    form.tags = [" om ", "", "shiva "];
    form.checklist = { titleChecked: true, listenThrough: true };
    const draft = draftFromForm(form);
    expect(draft.media.thumb).toEqual({ key: "wallpaper/s/thumb.abcd1234.webp", bytes: 10 });
    expect(draft.tags).toEqual(["om", "shiva"]);
    expect(draft.saveGate).toBe("REWARDED");
    // listenThrough only applies to BHAJAN.
    expect(draft.private.checklist).toEqual({ titleChecked: true });
    expect(draftFromForm(formFromDraft(draft))).toEqual(draft);
  });

  it("keeps stored provenance, checklist and media it does not show", () => {
    const stored = draftFromForm({
      ...emptyForm("BHAJAN"),
      aiTool: "Suno",
      sourceTextRef: "Tulsidas",
      checklist: { titleChecked: true },
      media: { stream: { key: "bhajan/x/stream.abcd1234.m4a" } },
      lyrics: { hi: "सखी री, आँगन सजा दो,", en: "Sakhi ri, aangan saja do," },
    });
    const form = formFromDraft(stored);
    form.tags = ["aarti"];
    const draft = draftFromForm(form);
    expect(draft.private).toEqual(stored.private);
    expect(draft.media).toEqual(stored.media);
    expect(draft.lyrics).toEqual(stored.lyrics);
    // Drafts saved before lyrics existed load with empty lyrics.
    expect(formFromDraft({ ...stored, lyrics: undefined }).lyrics).toEqual({ hi: "", en: "" });
  });

  it("generates a slug ID from the English title", () => {
    expect(generateContentId({ type: "WALLPAPER", title: { hi: "", en: "Hanuman Ji — Gold!" } })).toMatch(
      /^hanuman-ji-gold-[a-z0-9]{4}$/,
    );
    expect(generateContentId({ type: "WALLPAPER", title: { hi: "हनुमान", en: "" } })).toMatch(
      /^wallpaper-[a-z0-9]{4}$/,
    );
  });

  it("words readiness for the editor's fields", () => {
    expect(
      editorReadiness("WALLPAPER", [
        { field: "title.hi", message: "Hindi title is required" },
        { field: "media.thumb", message: "x" },
        { field: "media.full", message: "y" },
        { field: "private.aiTool", message: "AI tool must be recorded" },
        { field: "checklist.titleChecked", message: "Checklist: …" },
      ]),
    ).toEqual([
      { field: "title.hi", message: "Hindi title is required" },
      { field: "Media", message: "Upload the wallpaper image" },
      { field: "Review", message: "2 review items (AI tool, source or checklist) not set in this editor" },
    ]);
  });

  it("separates shape errors from readiness", () => {
    const valid = validateForm(emptyForm());
    expect(valid.issues).toEqual([]);
    expect(valid.readiness.length).toBeGreaterThan(0);
    const form = emptyForm();
    form.durationSeconds = "abc";
    expect(validateForm(form).issues[0].field).toBe("durationSeconds");
  });
});

describe("parseHash", () => {
  it("parses the admin routes", () => {
    expect(parseHash("")).toEqual({ name: "home-redirect" });
    expect(parseHash("#/content")).toEqual({ name: "content" });
    expect(parseHash("#/content/new")).toEqual({ name: "content-new" });
    expect(parseHash("#/content/edit/om%20x")).toEqual({ name: "content-edit", id: "om x" });
    expect(parseHash("#/dashboard")).toEqual({ name: "dashboard" });
    expect(parseHash("#/users/abc123")).toEqual({ name: "user", uid: "abc123" });
    expect(parseHash("#/mandir-offerings")).toEqual({ name: "mandir-offerings" });
    expect(parseHash("#/content/edit")).toEqual({ name: "not-found" });
    expect(parseHash("#/wallpapers")).toEqual({ name: "wallpapers" });
    expect(parseHash("#/status-videos")).toEqual({ name: "status-videos" });
    expect(parseHash("#/content/new/RINGTONE")).toEqual({ name: "content-new", type: "RINGTONE" });
    expect(parseHash("#/content/new/PODCAST")).toEqual({ name: "not-found" });
    expect(parseHash("#/nope")).toEqual({ name: "not-found" });
  });
});

describe("distinctTags", () => {
  it("dedupes case-insensitively, most used first", () => {
    expect(distinctTags([["Om", "shiva"], ["om", " Aarti "], null, ["shiva", "om", ""]])).toEqual([
      "Om",
      "shiva",
      "Aarti",
    ]);
  });
});

describe("withoutUndefined", () => {
  it("drops undefined fields at any depth and keeps null and arrays", () => {
    expect(
      withoutUndefined({ a: undefined, b: null, c: { d: undefined, e: 1 }, f: [{ g: undefined, h: "x" }] }),
    ).toEqual({ b: null, c: { e: 1 }, f: [{ h: "x" }] });
  });
});

describe("library previews", () => {
  it("has a section for every content type", () => {
    expect(Object.values(librarySections).sort()).toEqual([...contentTypes].sort());
    expect(sectionForType("STATUS")).toBe("status-videos");
  });

  it("plays the MP3 for ringtones and the stream for devotional audio", () => {
    const media = { stream: { key: "a/stream.m4a" }, file: { key: "a/file.mp3" } };
    expect(audioVariant("RINGTONE", media)?.key).toBe("a/file.mp3");
    expect(audioVariant("BHAJAN", media)?.key).toBe("a/stream.m4a");
    expect(audioVariant("AARTI", { file: { key: "b.mp3" } })?.key).toBe("b.mp3");
  });

  it("formats durations", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.4)).toBe("1:05");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(null)).toBe("–:––");
  });
});
