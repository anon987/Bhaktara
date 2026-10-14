import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import manifest from "../assets/mandir/manifest.json";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Txt } from "../src/components/ui";
import { DecorItem } from "../src/domain/mandirDecor";
import { forbiddenFlowers, offeringsFor } from "../src/domain/puja";
import { PlayerProvider } from "../src/features/player/PlayerProvider";
import {
  bundledDecor,
  bundledMurti,
} from "../src/features/sadhana/decor/bundled";
import {
  chosen,
  flowersFor,
  isLocked,
  MandirDecor,
  mergeDecor,
  murtiFor,
  rewardedAdsOn,
  storeUnlock,
  templeAfterSwipe,
  watchAdToUnlock,
} from "../src/features/sadhana/decor/decor";
import { murtiBox, templeView } from "../src/features/sadhana/decor/geometry";
import { PrayerScreen } from "../src/features/sadhana/PujaScreen";
import { ProgressionProvider } from "../src/features/sadhana/ProgressionProvider";
import { mockContentRepository } from "../src/repositories/mockRepository";
import { remoteConfig } from "../src/services/remoteConfig";
import { initialState, localStore } from "../src/services/storage/localStore";

const none = () => null;
const remote = (patch: Partial<DecorItem> & { id: string }): DecorItem => ({
  kind: "temple",
  name: { en: "Remote", hi: "रिमोट" },
  imageKey: "mandir/remote.webp",
  deityIds: [],
  unlock: "FREE",
  sortOrder: 1,
  ...patch,
});
const byId = (items: MandirDecor[], id: string) =>
  items.find((item) => item.id === id);

describe("bundled mandir decor", () => {
  it("bundles every manifest item with its image (and bells their sound)", () => {
    expect(bundledDecor.map((item) => item.id).sort()).toEqual(
      manifest.offerings.map((item) => item.id).sort(),
    );
    for (const item of bundledDecor) {
      expect(item.image).toBeDefined();
      expect(item.aspect).toBeGreaterThan(0);
      if (item.kind === "bell") expect(item.sound).toBeDefined();
      if (item.kind === "temple") expect(item.stage).toBeDefined();
    }
    for (const deityId of Object.keys(manifest.murti))
      expect(bundledMurti(deityId)).not.toBeNull();
    expect(bundledMurti("someone-new")).toBeNull();
  });
});

describe("decor merge (bundled + published)", () => {
  const resolve = (key: string) =>
    key.startsWith("placeholder/") ? null : `https://cdn.test/${key}`;

  it("lets a published item override the bundled one with the same id", () => {
    const merged = mergeDecor(
      bundledDecor,
      [
        remote({
          id: "temple-golden",
          name: { en: "Golden (festival)", hi: "स्वर्ण" },
          imageKey: "mandir/golden-2.webp",
          unlock: "FREE",
        }),
      ],
      resolve,
    );
    const golden = byId(merged, "temple-golden")!;
    expect(golden.name.en).toBe("Golden (festival)");
    expect(golden.unlock).toBe("FREE");
    expect(golden.image).toEqual({
      uri: "https://cdn.test/mandir/golden-2.webp",
    });
    // A CDN image reports its own size; the bundled stage is kept.
    expect(golden.aspect).toBeUndefined();
    expect(golden.stage).toEqual(byId(bundledDecor, "temple-golden")!.stage);
    expect(merged).toHaveLength(bundledDecor.length);
  });

  it("keeps the bundled image when the published one cannot be loaded", () => {
    const merged = mergeDecor(
      bundledDecor,
      [
        remote({
          id: "light-led",
          kind: "light",
          imageKey: "placeholder/led",
          unlock: "FREE",
        }),
      ],
      resolve,
    );
    const led = byId(merged, "light-led")!;
    expect(led.unlock).toBe("FREE");
    expect(led.image).toBe(byId(bundledDecor, "light-led")!.image);
    expect(led.placement).toBe("top");
  });

  it("adds new published items and skips ones with nothing to draw", () => {
    const merged = mergeDecor(
      bundledDecor,
      [
        remote({
          id: "bell-new",
          kind: "bell",
          soundKey: "mandir/new.m4a",
        }),
        remote({ id: "temple-unseen", imageKey: "placeholder/x" }),
      ],
      resolve,
    );
    expect(byId(merged, "bell-new")?.sound).toEqual({
      uri: "https://cdn.test/mandir/new.m4a",
    });
    expect(byId(merged, "temple-unseen")).toBeUndefined();
  });

  it("stands the catalogue murti when it loads, else the bundled one", () => {
    expect(
      murtiFor({ id: "shiva", murtiKey: "deities/shiva.png" }, resolve, none),
    ).toEqual({ source: { uri: "https://cdn.test/deities/shiva.png" } });
    expect(murtiFor({ id: "shiva" }, resolve, bundledMurti)).toEqual(
      bundledMurti("shiva"),
    );
    expect(murtiFor({ id: "new" }, resolve, bundledMurti)).toBeNull();
  });
});

describe("flowers offered to each deity", () => {
  const deities = [
    ...Object.keys(manifest.murti),
    ...Object.keys(forbiddenFlowers),
    "someone-new",
  ];

  it("never offers a forbidden flower, even one the admin named", () => {
    const named = mergeDecor(
      bundledDecor,
      [
        remote({
          id: "flower-tulsi-shiva",
          kind: "flower",
          flowerKind: "tulsi",
          deityIds: ["shiva", "ganesha"],
          imageKey: "mandir/tulsi.webp",
        }),
      ],
      (key) => key,
    );
    for (const deityId of deities) {
      const kinds = flowersFor(named, deityId).map((item) => item.flowerKind);
      for (const banned of forbiddenFlowers[deityId] ?? [])
        expect(kinds).not.toContain(banned);
      for (const kind of kinds)
        expect(offeringsFor(deityId).flowers).toContain(kind);
    }
  });

  it("always keeps at least one free flower", () => {
    for (const deityId of deities)
      expect(
        flowersFor(bundledDecor, deityId).some(
          (item) => item.unlock === "FREE",
        ),
      ).toBe(true);
    // Even when the admin marks all of Shiva's flowers rewarded.
    const allRewarded = bundledDecor.map((item) =>
      item.kind === "flower" ? { ...item, unlock: "REWARDED" as const } : item,
    );
    const shiva = flowersFor(allRewarded, "shiva");
    expect(shiva.filter((item) => item.unlock === "FREE")).toHaveLength(1);
  });

  it("offers a kindless flower only to the deities it names", () => {
    const items = [
      ...bundledDecor,
      {
        ...byId(bundledDecor, "flower-rose")!,
        id: "flower-mixed",
        flowerKind: undefined,
        deityIds: ["krishna"],
      },
    ];
    expect(flowersFor(items, "krishna").map((item) => item.id)).toContain(
      "flower-mixed",
    );
    expect(flowersFor(items, "shiva").map((item) => item.id)).not.toContain(
      "flower-mixed",
    );
  });
});

describe("unlocking decor with a rewarded ad", () => {
  const rewarded = { id: "temple-golden", unlock: "REWARDED" as const };
  const single = { id: "light-led", unlock: "REWARDED_SINGLE_USE" as const };
  const free = { id: "temple-marble", unlock: "FREE" as const };
  const visit = new Set<string>();

  it("makes everything free while rewarded ads are off", () => {
    const off = { adsOn: false, unlocked: [], visit };
    expect(isLocked(rewarded, off)).toBe(false);
    expect(isLocked(single, off)).toBe(false);
    expect(rewardedAdsOn({ getBoolean: () => false })).toBe(false);
    // The default Remote Config has rewarded ads off.
    expect(rewardedAdsOn(remoteConfig)).toBe(false);
    expect(
      rewardedAdsOn({ getBoolean: (key) => key !== "ads_all_enabled" }),
    ).toBe(false);
    expect(rewardedAdsOn({ getBoolean: () => true })).toBe(true);
  });

  it("keeps REWARDED unlocks for good and single-use ones for the visit", () => {
    const on = { adsOn: true, unlocked: [] as string[], visit };
    expect(isLocked(free, on)).toBe(false);
    expect(isLocked(rewarded, on)).toBe(true);
    const stored = storeUnlock(rewarded, on.unlocked);
    expect(stored).toEqual(["temple-golden"]);
    expect(storeUnlock(rewarded, stored)).toEqual(["temple-golden"]);
    expect(isLocked(rewarded, { ...on, unlocked: stored })).toBe(false);
    expect(storeUnlock(single, [])).toEqual([]);
    expect(isLocked(single, { ...on, unlocked: ["light-led"] })).toBe(true);
    expect(isLocked(single, { ...on, visit: new Set(["light-led"]) })).toBe(
      false,
    );
  });

  it("unlocks on a reward, no fill or an ad error; not when closed early", async () => {
    const show = (outcome: "rewarded" | "no-fill" | "dismissed") => ({
      show: jest.fn(async () => outcome),
    });
    expect(await watchAdToUnlock(show("rewarded"))).toBe(true);
    expect(await watchAdToUnlock(show("no-fill"))).toBe(true);
    expect(await watchAdToUnlock(show("dismissed"))).toBe(false);
    const failing = {
      show: jest.fn(async () => {
        throw new Error("no ads");
      }),
    };
    expect(await watchAdToUnlock(failing)).toBe(true);
    expect(failing.show).toHaveBeenCalledWith("unlock_mandir_decor");
  });
});

describe("temple carousel", () => {
  const temples = [
    { id: "a", unlock: "FREE" },
    { id: "b", unlock: "REWARDED" },
    { id: "c", unlock: "FREE" },
  ];
  const locked = (item: { unlock: string }) => item.unlock !== "FREE";

  it("saves a swiped-to temple only when it is open", () => {
    expect(templeAfterSwipe("a", temples[1], true)).toBe("a");
    expect(templeAfterSwipe(null, temples[1], true)).toBeNull();
    expect(templeAfterSwipe("a", temples[2], false)).toBe("c");
  });

  it("falls back to the first open temple when the saved one is locked", () => {
    expect(chosen(temples, "b", locked)?.id).toBe("a");
    expect(chosen(temples, "c", locked)?.id).toBe("c");
    expect(chosen(temples, null, locked)?.id).toBe("a");
    expect(chosen(temples, "gone", locked)?.id).toBe("a");
  });

  it("stands the murti in the stage, feet on its bottom edge", () => {
    const view = templeView(390, 380, 720 / 1260, {
      x: 0.36,
      y: 0.47,
      width: 0.28,
      height: 0.27,
    });
    // The temple covers the window.
    expect(view.image.x).toBeLessThanOrEqual(0);
    expect(view.image.y).toBeLessThanOrEqual(0);
    expect(view.image.x + view.image.width).toBeGreaterThanOrEqual(390);
    expect(view.image.y + view.image.height).toBeGreaterThanOrEqual(380);
    // The sanctum is centred with room below for the offerings.
    expect(view.stage.x + view.stage.width / 2).toBeCloseTo(195);
    expect(view.stage.y + view.stage.height).toBeCloseTo(380 * 0.8);
    const murti = murtiBox(view.stage, 0.5);
    expect(murti.y + murti.height).toBeCloseTo(
      view.stage.y + view.stage.height,
    );
    expect(murti.x + murti.width / 2).toBeCloseTo(195);
    expect(murti.width / murti.height).toBeCloseTo(0.5);
    expect(murti.height).toBeLessThanOrEqual(view.stage.height + 0.001);
  });
});

// ---- The Prayer screen with the decor ----

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function Status() {
  const { local } = useApp();
  return <Txt testID="state">{JSON.stringify(local)}</Txt>;
}
function Wrapper({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <DialogProvider>
          <PlayerProvider>
            <ProgressionProvider>
              {children}
              <Status />
            </ProgressionProvider>
          </PlayerProvider>
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
const navigation = { goBack: jest.fn() };
const state = (screen: {
  getByTestId(id: string): { props: { children: string } };
}) => JSON.parse(screen.getByTestId("state").props.children);

async function openPrayer() {
  const screen = render(
    <PrayerScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(screen.getByTestId("puja-stage")).toBeTruthy());
  fireEvent(screen.getByTestId("puja-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 380 } },
  });
  await waitFor(() =>
    expect(screen.getByTestId("temple-carousel")).toBeTruthy(),
  );
  return screen;
}

// Each test mounts the whole screen (slow on a cold cache).
jest.setTimeout(40000);
describe("Prayer screen decor", () => {
  beforeEach(() => {
    jest
      .spyOn(localStore, "read")
      .mockResolvedValue({ ...initialState, language: "en" });
    jest.spyOn(localStore, "write").mockResolvedValue();
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows no locks while rewarded ads are off", async () => {
    const screen = await openPrayer();
    fireEvent.press(screen.getByLabelText("Lights"));
    expect(screen.getByTestId("light-chooser")).toBeTruthy();
    expect(screen.queryAllByLabelText(/Locked/)).toHaveLength(0);
    fireEvent.press(screen.getByLabelText("Colourful lights"));
    expect(screen.queryByTestId("unlock-sheet")).toBeNull();
    expect(state(screen).mandir.lightId).toBe("light-led");
    fireEvent.press(screen.getByLabelText("No lights"));
    expect(state(screen).mandir.lightId).toBe("none");
  });

  it("with rewarded ads on, a locked light unlocks for good after an ad", async () => {
    jest.spyOn(remoteConfig, "getBoolean").mockReturnValue(true);
    const screen = await openPrayer();
    // The published fixture made marigold lights free.
    fireEvent.press(screen.getByLabelText("Lights"));
    expect(screen.getByLabelText("Marigold lights")).toBeTruthy();
    // Not now: nothing changes.
    fireEvent.press(screen.getByLabelText("Colourful lights, Locked"));
    expect(screen.getByTestId("unlock-sheet")).toBeTruthy();
    fireEvent.press(screen.getByText("Not now"));
    expect(screen.queryByTestId("unlock-sheet")).toBeNull();
    expect(state(screen).mandir.lightId).toBeNull();
    // Watch: no ad SDK yet, so no fill, which still unlocks (doc 11 §4).
    fireEvent.press(screen.getByLabelText("Colourful lights, Locked"));
    await act(async () => {
      fireEvent.press(screen.getByText("Watch a short ad to unlock"));
    });
    await waitFor(() =>
      expect(state(screen).mandir).toMatchObject({
        lightId: "light-led",
        unlocked: ["light-led"],
      }),
    );
    expect(screen.getByLabelText("Colourful lights")).toBeTruthy();
  });

  it("swiping onto a locked temple keeps the saved one", async () => {
    jest.spyOn(remoteConfig, "getBoolean").mockReturnValue(true);
    const screen = await openPrayer();
    fireEvent.press(screen.getByLabelText("Next temple"));
    expect(state(screen).mandir.templeId).toBe("temple-wooden");
    // The golden temple needs an ad: looking at it does not choose it.
    fireEvent.press(screen.getByLabelText("Next temple"));
    expect(state(screen).mandir.templeId).toBe("temple-wooden");
    fireEvent.press(screen.getByLabelText("Previous temple"));
    fireEvent.press(screen.getByLabelText("Previous temple"));
    expect(state(screen).mandir.templeId).toBe("temple-marble");
  });

  it("offers Shiva's flowers, locked ones behind an ad, never tulsi", async () => {
    jest.spyOn(remoteConfig, "getBoolean").mockReturnValue(true);
    const screen = await openPrayer();
    fireEvent.press(screen.getByLabelText("Offer flowers and a garland"));
    expect(screen.getByLabelText("Bel leaf")).toBeTruthy();
    expect(screen.getByLabelText("Dhatura, Locked")).toBeTruthy();
    expect(screen.queryByLabelText(/Tulsi/)).toBeNull();
    fireEvent.press(screen.getByLabelText("Dhatura, Locked"));
    expect(screen.getByTestId("unlock-sheet")).toBeTruthy();
  });
});

// The fixture repository publishes decor too (fixture mode).
test("fixture mode publishes a decor override and skips inactive items", async () => {
  const items = await mockContentRepository.getMandirDecor!();
  expect(items.map((item) => item.id)).toEqual(["light-marigold"]);
  expect(items[0]).toMatchObject({ kind: "light", unlock: "FREE" });
});
