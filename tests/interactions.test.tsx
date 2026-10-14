import { DialogProvider } from "../src/components/Dialog";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { OnboardingScreen } from "../src/features/onboarding/OnboardingScreen";
import {
  JaapScreen,
  MeditationScreen,
  PrayerScreen,
} from "../src/features/sadhana/PracticeScreens";
import { localStore, initialState } from "../src/services/storage/localStore";
import { Txt } from "../src/components/ui";
import { localPracticeDay } from "../src/domain/practice";
import { PlayerProvider } from "../src/features/player/PlayerProvider";
import { ProgressionProvider } from "../src/features/sadhana/ProgressionProvider";
import { BlessingSheet } from "../src/features/sadhana/BlessingSheet";
import { Backend } from "../src/services/backend";
import { mockContentRepository } from "../src/repositories/mockRepository";
import {
  ProgressionRepository,
  ProgressSnapshot,
} from "../src/repositories/progressionRepository";
import {
  bhaktiDayAt,
  defaultGamificationConfig,
  defaultSadhanaConfig,
  emptyCounters,
  emptyPracticeDay,
  PracticeResult,
} from "../src/domain/progression";
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
              <BlessingSheet />
              <Status />
            </ProgressionProvider>
          </PlayerProvider>
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
// Screens only call goBack in these isolated tests; navigation behavior is checked in the smoke run.
const navigation = { goBack: jest.fn() };
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});
test("onboarding asks only for language and persists the choice", async () => {
  const screen = render(<OnboardingScreen />, { wrapper: Wrapper });
  await waitFor(() =>
    expect(screen.getByText("Choose your language")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("हिन्दी"));
  fireEvent.press(screen.getByText("आगे बढ़ें"));
  await waitFor(() =>
    expect(localStore.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: "hi", onboarded: true }),
    ),
  );
  expect(screen.queryByText("Continue with Google")).toBeNull();
});
const state = (screen: {
  getByTestId(id: string): { props: { children: string } };
}) => JSON.parse(screen.getByTestId("state").props.children);
const tap = (screen: { getByTestId(id: string): unknown }, times: number) => {
  for (let count = 0; count < times; count++)
    fireEvent.press(screen.getByTestId("jaap-counter") as never);
};

test("fixture mode: 108 taps complete one mala on the device, earning nothing", async () => {
  const screen = render(
    <JaapScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(
      screen.getByText("Practice is saved on this phone only."),
    ).toBeTruthy(),
  );
  tap(screen, 108);
  const local = state(screen);
  expect(local.jaapCount).toBe(108);
  expect(local.jaapDay).toBe(localPracticeDay());
  expect(local.days[localPracticeDay()].jaap).toBe(true);
  expect(screen.getByText("1 malas today")).toBeTruthy();
  expect(local.totalXp).toBeUndefined();
});

test("yesterday's leftover beads do not count toward today (D-051)", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    jaapCount: 100,
    jaapDay: "2020-01-01",
  });
  const screen = render(
    <JaapScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(screen.getByText("0 malas today")).toBeTruthy());
  tap(screen, 8);
  expect(state(screen).jaapCount).toBe(8);
  expect(state(screen).days).toEqual({});
});

// Circles the finger round the deity (the scene is laid out at 300 × 360,
// which puts the deity at about (150, 209); the item rides 40 above).
function circleRound(
  screen: { getByTestId(id: string): unknown },
  turns: number,
) {
  const hand = screen.getByTestId("puja-hand") as never;
  const at = (angle: number) => ({
    nativeEvent: {
      locationX: 150 + Math.cos(angle) * 80,
      locationY: 209 + Math.sin(angle) * 80 + 40,
    },
  });
  fireEvent(hand, "responderGrant", at(0));
  for (let step = 1; step <= turns * 24; step++)
    fireEvent(hand, "responderMove", at((step / 24) * Math.PI * 2));
  fireEvent(hand, "responderRelease", at(0));
}

test("the puja is performed from the tray of offerings (D-054)", async () => {
  const screen = render(
    <PrayerScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(screen.getByTestId("puja-stage")).toBeTruthy());
  fireEvent(screen.getByTestId("puja-stage"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 360 } },
  });
  // Optional offerings: kalash, bell. The temple lights stand where the
  // tilak was.
  fireEvent.press(screen.getByLabelText("Sprinkle water from the kalash"));
  fireEvent.press(screen.getByLabelText("Ring the bell"));
  expect(screen.queryByLabelText("Apply the chandan-roli tilak")).toBeNull();
  expect(screen.getByLabelText("Lights")).toBeTruthy();
  // Decor flowers suited to Shiva (the first deity): bel leaf, dhatura…
  // never tulsi.
  fireEvent.press(screen.getByLabelText("Offer flowers and a garland"));
  expect(screen.getByLabelText("Bel leaf")).toBeTruthy();
  expect(screen.getByLabelText("Dhatura")).toBeTruthy();
  expect(screen.queryByLabelText("Tulsi")).toBeNull();
  fireEvent.press(screen.getByLabelText("Bel leaf"));
  fireEvent.press(screen.getByLabelText("Rudraksha garland"));
  // Incense, waved freely.
  fireEvent.press(screen.getByLabelText("Offer incense"));
  circleRound(screen, 2);
  // The item settles back on the altar (timers, so wait inside act).
  await act(() => new Promise((resolve) => setTimeout(resolve, 2300)));
  expect(screen.queryByTestId("puja-hand")).toBeNull();
  // Shiva's bhog.
  fireEvent.press(screen.getByLabelText("Offer bhog"));
  fireEvent.press(screen.getByLabelText("Milk"));
  // Aarti with the lamp, three circles round the deity.
  fireEvent.press(screen.getByLabelText("Do the aarti with the lamp"));
  circleRound(screen, 4);
  // The item settles back on the altar (timers, so wait inside act).
  await act(() => new Promise((resolve) => setTimeout(resolve, 2300)));
  expect(screen.queryByTestId("puja-hand")).toBeNull();
  expect(state(screen).days).toEqual({});
  // The shankh completes the puja and records the day's prayer.
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Blow the shankh"));
  });
  expect(state(screen).days[localPracticeDay()].prayer).toBe(true);
}, 40000);

test("the puja is never locked once today's prayer is recorded", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    days: {
      [localPracticeDay()]: { jaap: false, meditation: false, prayer: true },
    },
  });
  const screen = render(
    <PrayerScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Ring the bell")).toBeTruthy(),
  );
  fireEvent.press(screen.getByLabelText("Offer flowers and a garland"));
  expect(screen.getByLabelText("Bel leaf")).toBeTruthy();
});

test("elapsed meditation restored from storage completes locally", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    timer: {
      durationSeconds: 300,
      remainingSeconds: 300,
      endsAt: Date.now() - 1000,
      sessionId: null,
    },
  });
  const screen = render(
    <MeditationScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getByText("Meditation complete. Om shanti.")).toBeTruthy(),
  );
  await waitFor(() =>
    expect(state(screen).days[localPracticeDay()]?.meditation).toBe(true),
  );
});

test("meditation that ended before a relaunch is credited to the day it ended", async () => {
  const endsAt = Date.now() - 3 * 86400000;
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    timer: {
      durationSeconds: 300,
      remainingSeconds: 300,
      endsAt,
      sessionId: null,
    },
  });
  const screen = render(
    <MeditationScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(
      state(screen).days[localPracticeDay(new Date(endsAt))]?.meditation,
    ).toBe(true),
  );
  expect(state(screen).days[localPracticeDay()]).toBeUndefined();
});

// ---- With the server (fake progression repository) ----

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
const malaResult: PracticeResult = {
  status: "COMPLETED",
  bhaktiDay: "2026-10-05",
  xpGranted: 45,
  capped: false,
  rewards: [],
  totalXp: 45,
  level: 1,
  rank: "JIGYASU",
  levelUp: false,
  rankUp: false,
  currentStreak: 1,
  longestStreak: 1,
  streakExtended: true,
  tasks: { jaap: true, meditation: false, prayer: false },
  fullSadhana: false,
  malasCredited: 1,
  minutesCredited: 0,
  challengesCompleted: [],
  badgesUnlocked: [
    { id: "pehli-mala", name: { hi: "पहली माला", en: "First mala" } },
  ],
};
function serverBackend(overrides: Partial<ProgressionRepository> = {}) {
  const progression: ProgressionRepository = {
    setTimezone: jest.fn(async (timezone: string) => ({
      timezone,
      bhaktiDay: today(),
    })),
    startSession: jest.fn(async ({ sessionId }) => ({
      sessionId,
      startedAt: Date.now(),
      bhaktiDay: today(),
    })),
    completeSession: jest.fn(async () => malaResult),
    completePrayer: jest.fn(async () => malaResult),
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
function renderJaap(loadBackend: () => Promise<Backend>) {
  return render(
    <JaapScreen navigation={navigation as never} route={{} as never} />,
    {
      wrapper: ({ children }) => (
        <Wrapper loadBackend={loadBackend}>{children}</Wrapper>
      ),
    },
  );
}

test("a mala with the server opens one session, completes it and blesses", async () => {
  const { progression, loadBackend } = serverBackend();
  const screen = renderJaap(loadBackend);
  // The shrine art makes the first render slow on CI machines.
  await waitFor(() => expect(progression.load).toHaveBeenCalled(), {
    timeout: 5000,
  });
  expect(
    screen.queryByText("Practice is saved on this phone only."),
  ).toBeNull();
  await act(async () => tap(screen, 107));
  expect(progression.startSession).toHaveBeenCalledTimes(1);
  const { sessionId } = (progression.startSession as jest.Mock).mock
    .calls[0][0];
  await act(async () => tap(screen, 1));
  await waitFor(() =>
    expect(progression.completeSession).toHaveBeenCalledWith({
      sessionId,
      malasCompleted: 1,
    }),
  );
  // A first milestone opens the blessing sheet.
  await waitFor(() =>
    expect(screen.getByText("New milestone: First mala")).toBeTruthy(),
  );
  // Inline over the mala and in the sheet.
  expect(screen.getAllByText("+45 XP")).toHaveLength(2);
  fireEvent.press(screen.getByText("Jai ho"));
  expect(screen.queryByText("New milestone: First mala")).toBeNull();
  // The next bead starts a fresh session for the next mala.
  await act(async () => tap(screen, 1));
  expect(progression.startSession).toHaveBeenCalledTimes(2);
});

test("offline practice continues and says it will not earn XP", async () => {
  const { progression, loadBackend } = serverBackend({
    startSession: jest.fn(async () => {
      throw Object.assign(new Error("offline"), {
        code: "functions/unavailable",
      });
    }),
  });
  const screen = renderJaap(loadBackend);
  // The shrine art makes the first render slow on CI machines.
  await waitFor(() => expect(progression.load).toHaveBeenCalled(), {
    timeout: 5000,
  });
  await act(async () => tap(screen, 108));
  await waitFor(() =>
    expect(
      screen.getByText(
        "No internet. Keep practising — this time won’t earn XP.",
      ),
    ).toBeTruthy(),
  );
  expect(progression.completeSession).not.toHaveBeenCalled();
  expect(state(screen).days[localPracticeDay()].jaap).toBe(true);
});

test("a mala the server finds too quick gets a gentle explanation", async () => {
  const { progression, loadBackend } = serverBackend({
    completeSession: jest.fn(async () => {
      throw Object.assign(new Error("short"), {
        code: "functions/failed-precondition",
        details: { reason: "SESSION_TOO_SHORT" },
      });
    }),
  });
  const screen = renderJaap(loadBackend);
  // The shrine art makes the first render slow on CI machines.
  await waitFor(() => expect(progression.load).toHaveBeenCalled(), {
    timeout: 5000,
  });
  await act(async () => tap(screen, 108));
  await waitFor(() =>
    expect(
      screen.getByText(
        "That mala was very quick. Chant slowly, with feeling — at least one minute per mala.",
      ),
    ).toBeTruthy(),
  );
});
