import {
  deityArtKey,
  emptyVisualsConfig,
  visualsConfigSchema,
  visualsFromDocument,
} from "../src/domain/visuals";
import { assetMediaType, configDocs } from "../src/domain/admin";
import { localStateSchema } from "../src/services/storage/localStore";

const art = (key: string) => ({ mobile: { key }, thumb: { key: `${key}-t` } });

describe("Prayer and Jaap visuals (D-057)", () => {
  it("reads one asset key per filled slot", () => {
    const visuals = visualsFromDocument({
      version: 3,
      scenes: { prayerBackground: art("banner/bg/mobile.webp") },
      tray: { deep: art("deity/diya/mobile.webp") },
      flowers: { lotus: art("deity/lotus/mobile.webp") },
      garlands: {},
      bhog: { laddoo: art("deity/laddoo/mobile.webp") },
    });
    expect(visuals.scenes.prayerBackground).toBe("banner/bg/mobile.webp");
    expect(visuals.tray).toEqual({ deep: "deity/diya/mobile.webp" });
    expect(visuals.flowers.lotus).toBe("deity/lotus/mobile.webp");
    expect(visuals.bhog.laddoo).toBe("deity/laddoo/mobile.webp");
  });

  it("skips a bad slot instead of dropping every image", () => {
    const visuals = visualsFromDocument({
      tray: {
        deep: { mobile: { key: "https://evil.example/x.png" } },
        shankh: art("deity/shankh/mobile.webp"),
        unknown: art("deity/x/mobile.webp"),
      },
    });
    expect(visuals.tray).toEqual({ shankh: "deity/shankh/mobile.webp" });
    expect(visualsFromDocument(null).tray).toEqual({});
  });

  it("reads deity images leniently", () => {
    expect(deityArtKey(art("deity/krishna/mobile.webp"))).toBe(
      "deity/krishna/mobile.webp",
    );
    expect(deityArtKey(undefined)).toBeUndefined();
    expect(deityArtKey({ mobile: {} })).toBeUndefined();
  });

  it("is a versioned admin config that refuses unknown slots", () => {
    expect(configDocs.visuals).toBe(visualsConfigSchema);
    expect(visualsConfigSchema.safeParse(emptyVisualsConfig()).success).toBe(
      true,
    );
    expect(
      visualsConfigSchema.safeParse({
        ...emptyVisualsConfig(),
        tray: { lamp: art("deity/x/mobile.webp") },
      }).success,
    ).toBe(false);
  });

  it("renders temples and decor as tall art, backgrounds as wide", () => {
    expect(assetMediaType("temple")).toBe("deity");
    expect(assetMediaType("decor")).toBe("deity");
    expect(assetMediaType("background")).toBe("banner");
  });

  it("keeps sound and vibration on for saved state from older versions", () => {
    const saved = {
      language: "hi",
      onboarded: true,
      favorites: [],
      deityId: "krishna",
      jaapCount: 12,
      timer: { durationSeconds: 300, remainingSeconds: 300, endsAt: null },
      days: {},
    };
    expect(localStateSchema.parse(saved).practice).toEqual({
      sound: true,
      vibration: true,
    });
  });
});
