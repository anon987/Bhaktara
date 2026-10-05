import { describe, expect, it } from "vitest";
import { parseHash } from "./app/router";
import { readConfig } from "./config";
import { draftFromForm, emptyForm, formFromDraft, validateForm } from "./content/draftForm";
import { readableError } from "./errors";
import { callableError } from "./test/fakeApi";

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
    form.tags = " om , , shiva ";
    form.checklist = { titleChecked: true, listenThrough: true };
    const draft = draftFromForm(form);
    expect(draft.media.thumb).toEqual({ key: "wallpaper/s/thumb.abcd1234.webp", bytes: 10 });
    expect(draft.tags).toEqual(["om", "shiva"]);
    expect(draft.saveGate).toBe("REWARDED");
    // listenThrough only applies to BHAJAN.
    expect(draft.private.checklist).toEqual({ titleChecked: true });
    expect(draftFromForm(formFromDraft(draft))).toEqual(draft);
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
    expect(parseHash("")).toEqual({ name: "home" });
    expect(parseHash("#/content")).toEqual({ name: "content" });
    expect(parseHash("#/content/new")).toEqual({ name: "content-new" });
    expect(parseHash("#/content/edit/om%20x")).toEqual({ name: "content-edit", id: "om x" });
    expect(parseHash("#/nope")).toEqual({ name: "not-found" });
  });
});
