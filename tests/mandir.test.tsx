import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Txt } from "../src/components/ui";
import {
  bhaktiDayAt,
  defaultGamificationConfig,
  defaultSadhanaConfig,
  emptyCounters,
  emptyPracticeDay,
  PracticeResult,
} from "../src/domain/progression";
import { MandirScreen } from "../src/features/mandir/MandirScreen";
import {
  bundledDecor,
  bundledMurti,
} from "../src/features/mandir/decor/bundled";
import { offerBox } from "../src/features/mandir/decor/geometry";
import { pageMurtiBox } from "../src/features/mandir/decor/TempleCarousel";
import { PlayerProvider } from "../src/features/player/PlayerProvider";
import { ProgressionProvider } from "../src/features/sadhana/ProgressionProvider";
import { SadhanaScreen } from "../src/features/sadhana/SadhanaScreen";
import { mockContentRepository } from "../src/repositories/mockRepository";
import {
  ProgressionRepository,
  ProgressSnapshot,
} from "../src/repositories/progressionRepository";
import { analytics } from "../src/services/analytics";
import { Backend } from "../src/services/backend";
import { remoteConfig } from "../src/services/remoteConfig";
import { initialState, localStore } from "../src/services/storage/localStore";

// The Mandir tab: the puja moved in from Sadhana, the daily visit and the
// special offerings (D-040).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function Status() {
  const { local } = useApp();
  return <Txt testID="state">{JSON.stringify(local)}</Txt>;
}
function Wrapper({
  children,
  loadBackend,
}: React.PropsWithChildren<{ loadBackend?: () => Promise<Backend> }>) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider {...(loadBackend ? { loadBackend } : {})}>
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
const state = (screen: {
  getByTestId(id: string): { props: { children: string } };
}) => JSON.parse(screen.getByTestId("state").props.children);

const STAGE = { width: 390, height: 380 };
async function openMandir(loadBackend?: () => Promise<Backend>) {
  const screen = render(<MandirScreen />, {
    wrapper: ({ children }) => (
      <Wrapper loadBackend={loadBackend}>{children}</Wrapper>
    ),
  });
  await waitFor(() => expect(screen.getByTestId("puja-stage")).toBeTruthy());
  fireEvent(screen.getByTestId("puja-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, ...STAGE } },
  });
  await waitFor(() =>
    expect(screen.getByTestId("temple-carousel")).toBeTruthy(),
  );
  return screen;
}

// ---- A fake server ----
const today = () => bhaktiDayAt(Date.now(), "Asia/Kolkata");
function snapshot(): ProgressSnapshot {
  return {
    timezone: "Asia/Kolkata",
    bhaktiDay: today(),
    totalXp: 0,
    level: 1,
    rank: "JIGYASU",
    levelFraction: 0,
    xpToNextLevel: 50,
    currentStreak: 0,
    longestStreak: 0,
    counters: emptyCounters(),
    today: emptyPracticeDay(),
    days: [],
    config: defaultGamificationConfig,
    sadhana: defaultSadhanaConfig,
    challenges: [],
    badges: [],
  };
}
const visitResult: PracticeResult = {
  status: "COMPLETED",
  bhaktiDay: today(),
  xpGranted: 5,
  capped: false,
  rewards: [],
  totalXp: 5,
  level: 1,
  rank: "JIGYASU",
  levelUp: false,
  rankUp: false,
  currentStreak: 0,
  longestStreak: 0,
  streakExtended: false,
  tasks: { jaap: false, meditation: false, prayer: false },
  fullSadhana: false,
  malasCredited: 0,
  minutesCredited: 0,
  challengesCompleted: [],
  badgesUnlocked: [],
};
function serverBackend(overrides: Partial<ProgressionRepository> = {}) {
  const progression: ProgressionRepository = {
    // The server's zone is the one the app's practice day follows.
    setTimezone: jest.fn(async () => ({
      timezone: "Asia/Kolkata",
      bhaktiDay: today(),
    })),
    startSession: jest.fn(async ({ sessionId }) => ({
      sessionId,
      startedAt: Date.now(),
      bhaktiDay: today(),
    })),
    completeSession: jest.fn(async () => visitResult),
    completePrayer: jest.fn(async () => visitResult),
    recordMandirVisit: jest.fn(async () => visitResult),
    load: jest.fn(async () => snapshot()),
    ...overrides,
  };
  const backend: Backend = {
    mode: "emulator",
    content: mockContentRepository,
    session: { ensureSession: async () => ({ uid: "u1", isAnonymous: true }) },
    progression,
  };
  return { progression, loadBackend: async () => backend };
}

// Each test mounts the whole Mandir (slow on a cold cache).
jest.setTimeout(40000);
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

test("Sadhana's third lamp is the puja in the Mandir and opens the Mandir tab", async () => {
  const navigation = { navigate: jest.fn() };
  const screen = render(
    <SadhanaScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  const lamp = await waitFor(() =>
    screen.getByLabelText("Puja in the Mandir, Begin"),
  );
  fireEvent.press(lamp);
  expect(navigation.navigate).toHaveBeenCalledWith("Mandir");
  expect(navigation.navigate).not.toHaveBeenCalledWith("Prayer");
});

test("the Mandir is a tab: no back button, and opening it is counted", async () => {
  const track = jest.spyOn(analytics, "track");
  const screen = await openMandir();
  expect(screen.queryByLabelText("Close")).toBeNull();
  expect(screen.getByLabelText("Choose your deity: Shiva")).toBeTruthy();
  expect(screen.getByLabelText("Do the aarti with the lamp")).toBeTruthy();
  expect(track).toHaveBeenCalledWith("mandir_open");
  fireEvent.press(screen.getByLabelText("Ring the bell"));
  expect(track).toHaveBeenCalledWith("mandir_bell_rung");
});

test("the first diya of the day records the Mandir visit once, with a calm note", async () => {
  const track = jest.spyOn(analytics, "track");
  const { progression, loadBackend } = serverBackend();
  const screen = await openMandir(loadBackend);
  await waitFor(() => expect(progression.load).toHaveBeenCalled());
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Do the aarti with the lamp"));
  });
  expect(track).toHaveBeenCalledWith("mandir_diya_lit");
  await waitFor(() =>
    expect(screen.getByText("Today’s darshan is done · +5 XP")).toBeTruthy(),
  );
  expect(progression.recordMandirVisit).toHaveBeenCalledTimes(1);
  expect(progression.recordMandirVisit).toHaveBeenCalledWith({
    deityId: "shiva",
  });
  expect(state(screen).mandir.visitDay).toBe(today());
  // Lighting it again the same day asks nothing more.
  fireEvent.press(screen.getByText("Reset offerings"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Do the aarti with the lamp"));
  });
  expect(progression.recordMandirVisit).toHaveBeenCalledTimes(1);
});

test("a visit already recorded today is not asked for again", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    mandir: { ...initialState.mandir, visitDay: today() },
  });
  const { progression, loadBackend } = serverBackend();
  const screen = await openMandir(loadBackend);
  await waitFor(() => expect(progression.load).toHaveBeenCalled());
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Do the aarti with the lamp"));
  });
  expect(progression.recordMandirVisit).not.toHaveBeenCalled();
  expect(screen.queryByTestId("darshan-note")).toBeNull();
});

test("a visit the server cannot record is ignored and the puja goes on", async () => {
  const { progression, loadBackend } = serverBackend({
    recordMandirVisit: jest.fn(async () => {
      throw Object.assign(new Error("missing"), {
        code: "functions/not-found",
      });
    }),
  });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const screen = await openMandir(loadBackend);
  await waitFor(() => expect(progression.load).toHaveBeenCalled());
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Do the aarti with the lamp"));
  });
  await waitFor(() =>
    expect(progression.recordMandirVisit).toHaveBeenCalledTimes(1),
  );
  // The lamp is in hand for the aarti; no note, no error, nothing saved.
  expect(screen.getByTestId("puja-hand")).toBeTruthy();
  expect(screen.queryByTestId("darshan-note")).toBeNull();
  expect(
    screen.queryByText(
      "No internet. Keep practising — this time won’t earn XP.",
    ),
  ).toBeNull();
  expect(state(screen).mandir.visitDay).toBeNull();
  expect(warn).toHaveBeenCalled();
});

test("with ads off a special offering is free and placed at its offerAt", async () => {
  const track = jest.spyOn(analytics, "track");
  const screen = await openMandir();
  fireEvent.press(screen.getByLabelText("Special offerings"));
  expect(screen.getByTestId("special-chooser")).toBeTruthy();
  expect(screen.queryAllByLabelText(/Locked/)).toHaveLength(0);
  // Shiva's own (rudraksha) is there; Krishna's peacock feather is not.
  expect(screen.getByLabelText("Rudraksha mala")).toBeTruthy();
  expect(screen.queryByLabelText("Peacock feather")).toBeNull();
  fireEvent.press(screen.getByLabelText("Golden mukut"));
  expect(screen.queryByTestId("unlock-sheet")).toBeNull();
  // On the head of Shiva's murti in the first temple.
  const temple = bundledDecor.find((item) => item.id === "temple-marble")!;
  const murti = pageMurtiBox(
    STAGE.width,
    STAGE.height,
    temple,
    undefined,
    bundledMurti("shiva")!.aspect,
  );
  const mukut = bundledDecor.find((item) => item.id === "special-mukut")!;
  const box = offerBox("head", murti, STAGE, mukut.aspect);
  const image = screen.getByTestId("special-special-mukut");
  expect(image.props.style).toMatchObject({
    width: box.width,
    height: box.height,
  });
  expect(box.y + box.height).toBeGreaterThan(murti.y);
  expect(box.y).toBeLessThan(murti.y);
  expect(track).toHaveBeenCalledWith("mandir_special_offering_tap", {
    offering_id: "special-mukut",
  });
  expect(track).toHaveBeenCalledWith("mandir_special_offering_used", {
    offering_id: "special-mukut",
    via: "free",
  });
  // A garland counts as the flowers on the tray.
  fireEvent.press(screen.getByLabelText("Special offerings"));
  fireEvent.press(screen.getByLabelText("Rudraksha mala"));
  expect(screen.getByTestId("special-special-garland-rudraksha")).toBeTruthy();
  expect(
    screen.getByLabelText("Offer flowers and a garland").props
      .accessibilityState,
  ).toMatchObject({ checked: true });
  // Reset clears them.
  fireEvent.press(screen.getByText("Reset offerings"));
  expect(screen.queryByTestId("special-special-mukut")).toBeNull();
  expect(screen.queryByTestId("special-special-garland-rudraksha")).toBeNull();
});

test("with ads on, one ad offers a special offering once", async () => {
  jest.spyOn(remoteConfig, "getBoolean").mockReturnValue(true);
  const track = jest.spyOn(analytics, "track");
  const screen = await openMandir();
  fireEvent.press(screen.getByLabelText("Special offerings"));
  fireEvent.press(screen.getByLabelText("Golden mukut, Locked"));
  expect(screen.getByTestId("unlock-sheet")).toBeTruthy();
  // Not now: nothing is offered.
  fireEvent.press(screen.getByText("Not now"));
  expect(screen.queryByTestId("special-special-mukut")).toBeNull();
  fireEvent.press(screen.getByLabelText("Golden mukut, Locked"));
  // No ad SDK in tests: no fill, which still offers it (doc 11 §4).
  await act(async () => {
    fireEvent.press(screen.getByText("Watch a short ad to offer"));
  });
  await waitFor(() =>
    expect(screen.getByTestId("special-special-mukut")).toBeTruthy(),
  );
  expect(track).toHaveBeenCalledWith("mandir_special_offering_used", {
    offering_id: "special-mukut",
    via: "fallback",
  });
  // That was one use: the next one needs another ad.
  fireEvent.press(screen.getByLabelText("Special offerings"));
  expect(screen.getByLabelText("Golden mukut, Locked")).toBeTruthy();
  expect(state(screen).mandir.unlocked).toEqual([]);
});
