import React, { useEffect } from "react";
import { Image, StyleSheet, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppProvider } from "../src/app/providers/AppProvider";
import {
  PlayerProvider,
  usePlayer,
} from "../src/features/player/PlayerProvider";
import { clampSeek, reachedCompletion } from "../src/features/player/playback";
import { fixtures } from "../src/repositories/fixtures";
import { localStore, initialState } from "../src/services/storage/localStore";
import { analytics } from "../src/services/analytics";
import { Content } from "../src/domain/models";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PlayerScreen } from "../src/features/player/PlayerScreen";

// A controllable stand-in for expo-audio's native player.
type Listener = (status: Record<string, unknown>) => void;
const mockAudio = {
  listener: null as Listener | null,
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(async () => undefined),
  setActiveForLockScreen: jest.fn(),
  clearLockScreenControls: jest.fn(),
  remove: jest.fn(),
  playing: false,
};
jest.mock("expo-audio", () => ({
  createAudioPlayer: () => ({
    ...mockAudio,
    addListener: (_event: string, listener: Listener) => {
      mockAudio.listener = listener;
    },
    get playing() {
      return mockAudio.playing;
    },
  }),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock("../src/services/media/config", () => {
  const { mediaUrl } = jest.requireActual("../src/domain/media");
  return {
    resolveMediaUrl: (key: string) => mediaUrl("https://cdn.example.com", key),
    setRuntimeMediaBaseUrl: () => undefined,
  };
});

const placeholder = fixtures.content.find((item) => item.id === "bhajan-1")!;
const streamable: Content = {
  ...placeholder,
  id: "bhajan-stream",
  media: {
    thumb: { key: "bhajan/bhajan-stream/thumb.0a1b2c3d.webp" },
    stream: {
      key: "bhajan/bhajan-stream/stream.0a1b2c3d.m4a",
      durationSeconds: 100,
    },
  },
};
const status = (overrides: Record<string, unknown>) => ({
  isLoaded: true,
  playing: true,
  isBuffering: false,
  currentTime: 0,
  duration: 100,
  didJustFinish: false,
  playbackState: "ready",
  ...overrides,
});

// The latest player API, captured after each render.
const handle: { current: ReturnType<typeof usePlayer> | null } = {
  current: null,
};
function Probe() {
  const player = usePlayer();
  useEffect(() => {
    handle.current = player;
  });
  return <Text testID="status">{player.status}</Text>;
}
// The app mounts the player only after saved settings hydrate; mirror that.
async function renderPlayer() {
  const screen = render(
    <AppProvider>
      <PlayerProvider>
        <Probe />
      </PlayerProvider>
    </AppProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return screen;
}
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
  jest.spyOn(analytics, "track").mockImplementation(() => undefined);
  // jest-expo's image loader fake can't answer getSize; artwork stays square.
  jest
    .spyOn(Image, "getSize")
    .mockImplementation(() => Promise.resolve({ width: 1, height: 1 }));
  Object.values(mockAudio).forEach(
    (value) => jest.isMockFunction(value) && value.mockClear(),
  );
  mockAudio.listener = null;
  handle.current = null;
});
afterEach(() => jest.restoreAllMocks());

test("seek and completion helpers stay inside the track", () => {
  expect(clampSeek(-5, 100)).toBe(0);
  expect(clampSeek(120, 100)).toBe(99.5);
  expect(reachedCompletion(79, 100)).toBe(false);
  expect(reachedCompletion(80, 100)).toBe(true);
  expect(reachedCompletion(10, 0)).toBe(false);
});

test("placeholder content is unavailable and never touches the player", async () => {
  const screen = await renderPlayer();
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.load(placeholder, "explore"));
  expect(screen.getByTestId("status").props.children).toBe("unavailable");
  expect(mockAudio.replace).not.toHaveBeenCalled();
});

test("a stream plays with lock-screen controls and reports play and completion once", async () => {
  const screen = await renderPlayer();
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.load(streamable, "home_rail"));
  expect(mockAudio.replace).toHaveBeenCalledWith({
    uri: "https://cdn.example.com/bhajan/bhajan-stream/stream.0a1b2c3d.m4a",
  });
  expect(mockAudio.play).toHaveBeenCalled();
  expect(mockAudio.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.objectContaining({
      title: "A morning with Krishna",
      artworkUrl:
        "https://cdn.example.com/bhajan/bhajan-stream/thumb.0a1b2c3d.webp",
    }),
    { showSeekForward: true, showSeekBackward: true },
  );
  expect(screen.getByTestId("status").props.children).toBe("loading");
  act(() => mockAudio.listener!(status({ currentTime: 1 })));
  expect(screen.getByTestId("status").props.children).toBe("ready");
  act(() => mockAudio.listener!(status({ currentTime: 85 })));
  act(() => mockAudio.listener!(status({ currentTime: 90 })));
  const events = (analytics.track as jest.Mock).mock.calls.map(
    ([event]) => event,
  );
  expect(events.filter((event) => event === "content_play")).toHaveLength(1);
  expect(events.filter((event) => event === "content_complete")).toHaveLength(
    1,
  );
  expect(analytics.track).toHaveBeenCalledWith(
    "content_play",
    expect.objectContaining({
      content_id: "bhajan-stream",
      source: "home_rail",
    }),
  );
  // Finishing rewinds, paused, so play restarts the track.
  act(() =>
    mockAudio.listener!(status({ currentTime: 100, didJustFinish: true })),
  );
  expect(mockAudio.seekTo).toHaveBeenCalledWith(0);
  expect(handle.current!.position).toBe(0);
  expect(handle.current!.playing).toBe(false);
  act(() => handle.current!.close());
  expect(mockAudio.clearLockScreenControls).toHaveBeenCalled();
  expect(screen.getByTestId("status").props.children).toBe("idle");
});

test("a stream that never loads becomes an error that can be retried", async () => {
  jest.useFakeTimers();
  try {
    const screen = await renderPlayer();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => handle.current!.load(streamable, "explore"));
    act(() => jest.advanceTimersByTime(20_000));
    expect(screen.getByTestId("status").props.children).toBe("error");
    act(() => handle.current!.retry());
    expect(mockAudio.replace).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("status").props.children).toBe("loading");
  } finally {
    jest.useRealTimers();
  }
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const sampleLyrics = `[Intro — Female Lead]
सखी री, आँगन सजा दो,
आज हनुमत का गुण गाएँ।

[Chorus — Lead and Female Group]
मेरे आँगन भजन की रात,
आओ सखियों, बजाओ ताली।`;
async function renderPlayerScreen(item: Content) {
  const screen = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <PlayerProvider>
          <Probe />
          <PlayerScreen
            navigation={{ goBack: jest.fn() } as never}
            route={{ key: "Player", name: "Player" } as never}
          />
        </PlayerProvider>
      </AppProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.load(item, "explore"));
  // Let the reduced-motion query settle.
  await act(async () => {
    await Promise.resolve();
  });
  return screen;
}

test("the player shows the lyrics stanzas without the section notes", async () => {
  // The app is in English and the Hinglish lyrics are empty: Hindi is shown.
  const screen = await renderPlayerScreen({
    ...streamable,
    lyrics: { hi: sampleLyrics, en: "" },
  });
  expect(screen.getByTestId("player-lyrics")).toBeTruthy();
  expect(screen.getByText("Lyrics")).toBeTruthy();
  // The chip under the controls leads down to them.
  expect(screen.getByTestId("player-lyrics-chip")).toBeTruthy();
  expect(screen.getByText("Read the lyrics")).toBeTruthy();
  expect(
    screen.getByText("सखी री, आँगन सजा दो,\nआज हनुमत का गुण गाएँ।", {
      normalizer: (text) => text,
    }),
  ).toBeTruthy();
  expect(
    screen.getByText("मेरे आँगन भजन की रात,\nआओ सखियों, बजाओ ताली।", {
      normalizer: (text) => text,
    }),
  ).toBeTruthy();
  expect(screen.queryByText(/Intro|Chorus|\[/)).toBeNull();
});

test("the player prefers the app language and hides an empty lyrics section", async () => {
  const screen = await renderPlayerScreen({
    ...streamable,
    lyrics: { hi: sampleLyrics, en: "[Intro]\nSakhi ri, aangan saja do," },
  });
  expect(screen.getByText("Sakhi ri, aangan saja do,")).toBeTruthy();
  expect(screen.queryByText(/सखी री/)).toBeNull();
  act(() =>
    handle.current!.load(
      { ...streamable, id: "plain", lyrics: { hi: "[Intro]", en: "" } },
      "explore",
    ),
  );
  expect(screen.queryByTestId("player-lyrics")).toBeNull();
  expect(screen.queryByTestId("player-lyrics-chip")).toBeNull();
});

test("repeat restarts the track when it finishes", async () => {
  await renderPlayer();
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.load(streamable, "explore"));
  act(() => mockAudio.listener!(status({ currentTime: 10 })));
  expect(handle.current!.repeat).toBe(false);
  act(() => handle.current!.setRepeat(true));
  expect(handle.current!.repeat).toBe(true);
  mockAudio.play.mockClear();
  mockAudio.pause.mockClear();
  act(() =>
    mockAudio.listener!(status({ currentTime: 100, didJustFinish: true })),
  );
  expect(mockAudio.seekTo).toHaveBeenCalledWith(0);
  expect(mockAudio.play).toHaveBeenCalledTimes(1);
  expect(mockAudio.pause).not.toHaveBeenCalled();
  expect(handle.current!.playing).toBe(true);
  expect(handle.current!.position).toBe(0);
  // Turned off, the next finish rewinds and stays paused.
  act(() => handle.current!.setRepeat(false));
  mockAudio.play.mockClear();
  act(() =>
    mockAudio.listener!(status({ currentTime: 100, didJustFinish: true })),
  );
  expect(mockAudio.play).not.toHaveBeenCalled();
  expect(mockAudio.pause).toHaveBeenCalled();
  expect(handle.current!.playing).toBe(false);
});

test("the sleep timer pauses after the chosen minutes", async () => {
  jest.useFakeTimers();
  try {
    await renderPlayer();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => handle.current!.load(streamable, "explore"));
    act(() => mockAudio.listener!(status({ currentTime: 5 })));
    act(() => handle.current!.setSleep(15));
    expect(handle.current!.sleepAt).toBe(Date.now() + 15 * 60_000);
    mockAudio.pause.mockClear();
    act(() => jest.advanceTimersByTime(15 * 60_000 - 1_000));
    expect(mockAudio.pause).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1_000));
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(handle.current!.sleepAt).toBeNull();
    // Turning the timer off cancels it.
    act(() => handle.current!.setSleep(30));
    act(() => handle.current!.setSleep(null));
    mockAudio.pause.mockClear();
    act(() => jest.advanceTimersByTime(31 * 60_000));
    expect(mockAudio.pause).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test("the sleep timer can pause at the end of the bhajan, even on repeat", async () => {
  await renderPlayer();
  await waitFor(() => expect(handle.current).not.toBeNull());
  act(() => handle.current!.load(streamable, "explore"));
  act(() => mockAudio.listener!(status({ currentTime: 10 })));
  act(() => handle.current!.setRepeat(true));
  act(() => handle.current!.setSleep("end"));
  expect(handle.current!.sleepAtEnd).toBe(true);
  mockAudio.play.mockClear();
  act(() =>
    mockAudio.listener!(status({ currentTime: 100, didJustFinish: true })),
  );
  expect(mockAudio.pause).toHaveBeenCalled();
  expect(mockAudio.play).not.toHaveBeenCalled();
  expect(handle.current!.playing).toBe(false);
  expect(handle.current!.sleepAtEnd).toBe(false);
});

// A touch for the PanResponder: one finger at pageX.
const touch = (locationX: number, pageX: number, timestamp: number) => ({
  nativeEvent: {
    locationX,
    locationY: 20,
    pageX,
    pageY: 20,
    identifier: 0,
    timestamp,
    touches: [],
    changedTouches: [],
  },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: timestamp,
    touchBank: [
      {
        touchActive: true,
        startPageX: pageX,
        startPageY: 20,
        startTimeStamp: timestamp,
        currentPageX: pageX,
        currentPageY: 20,
        currentTimeStamp: timestamp,
        previousPageX: pageX,
        previousPageY: 20,
        previousTimeStamp: timestamp,
      },
    ],
  },
});

test("the seek bar drags, shows the target time and seeks on release", async () => {
  const screen = await renderPlayerScreen(streamable);
  act(() => mockAudio.listener!(status({ currentTime: 10 })));
  const seek = screen.getByTestId("player-seek");
  fireEvent(seek, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 56 } },
  });
  // Grab at a quarter, drag to the middle: the target time shows, no seek yet.
  fireEvent(seek, "responderGrant", touch(50, 100, 1));
  fireEvent(seek, "responderMove", touch(100, 150, 2));
  expect(screen.getByText("0:50")).toBeTruthy();
  expect(mockAudio.seekTo).not.toHaveBeenCalled();
  fireEvent(seek, "responderRelease", touch(100, 150, 3));
  expect(mockAudio.seekTo).toHaveBeenCalledWith(50);
  // A tap on the track seeks there.
  fireEvent(seek, "responderGrant", touch(160, 300, 4));
  fireEvent(seek, "responderRelease", touch(160, 300, 5));
  expect(mockAudio.seekTo).toHaveBeenLastCalledWith(80);
  // Screen readers still adjust in 15-second steps.
  expect(seek.props.accessibilityRole).toBe("adjustable");
  expect(seek.props.accessibilityLabel).toBe("Playback position");
  expect(
    seek.props.accessibilityActions.map(({ name }: { name: string }) => name),
  ).toEqual(["increment", "decrement"]);
  act(() => mockAudio.listener!(status({ currentTime: 20 })));
  fireEvent(seek, "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });
  expect(mockAudio.seekTo).toHaveBeenLastCalledWith(35);
  fireEvent(seek, "accessibilityAction", {
    nativeEvent: { actionName: "decrement" },
  });
  expect(mockAudio.seekTo).toHaveBeenLastCalledWith(5);
});

test("the player names the deity instead of the app", async () => {
  const screen = await renderPlayerScreen(streamable);
  await waitFor(() =>
    expect(screen.getByTestId("player-subtitle").props.children).toBe(
      "Krishna",
    ),
  );
  expect(screen.getByText("A morning with Krishna")).toBeTruthy();
  // The other language's title sits below it.
  expect(screen.getByText("कृष्ण के संग एक सुबह")).toBeTruthy();
  expect(screen.queryByText("Bhaktara")).toBeNull();
  // Without a known deity, the content type stands in.
  act(() =>
    handle.current!.load(
      { ...streamable, id: "no-deity", deityIds: ["unknown"] },
      "explore",
    ),
  );
  expect(screen.getByTestId("player-subtitle").props.children).toBe("Bhajan");
});

test("the artwork frame follows the thumb's shape, from square to 16:9", async () => {
  const getSize = jest
    .spyOn(Image, "getSize")
    .mockImplementation((uri, success) => {
      if (uri.includes("landscape")) success?.(1408, 768);
      else success?.(800, 800);
      return Promise.resolve({ width: 0, height: 0 });
    });
  const ratioOf = (screen: ReturnType<typeof render>) =>
    StyleSheet.flatten(screen.getByTestId("player-art").props.style)
      .aspectRatio;
  const withThumb = (
    id: string,
    thumb: Content["media"]["thumb"],
  ): Content => ({
    ...streamable,
    id,
    media: { ...streamable.media, thumb },
  });
  const screen = await renderPlayerScreen(
    withThumb("landscape", { key: "bhajan/landscape/thumb.0a1b2c3d.webp" }),
  );
  await waitFor(() => expect(ratioOf(screen)).toBeCloseTo(16 / 9));
  expect(getSize).toHaveBeenCalledWith(
    "https://cdn.example.com/bhajan/landscape/thumb.0a1b2c3d.webp",
    expect.any(Function),
    expect.any(Function),
  );
  act(() =>
    handle.current!.load(
      withThumb("square", { key: "bhajan/square/thumb.0a1b2c3d.webp" }),
      "explore",
    ),
  );
  await waitFor(() => expect(ratioOf(screen)).toBe(1));
  // Known dimensions are used without measuring; tall art stays square.
  getSize.mockClear();
  act(() =>
    handle.current!.load(
      withThumb("tall", {
        key: "bhajan/tall/thumb.0a1b2c3d.webp",
        width: 600,
        height: 900,
      }),
      "explore",
    ),
  );
  expect(ratioOf(screen)).toBe(1);
  expect(getSize).not.toHaveBeenCalled();
});

test("the repeat and sleep timer buttons show what is set", async () => {
  const screen = await renderPlayerScreen(streamable);
  act(() => mockAudio.listener!(status({ currentTime: 10 })));
  fireEvent.press(screen.getByTestId("player-repeat"));
  expect(handle.current!.repeat).toBe(true);
  expect(screen.getByText("Repeat on")).toBeTruthy();
  fireEvent.press(screen.getByTestId("player-sleep"));
  fireEvent.press(screen.getByTestId("sleep-30"));
  expect(handle.current!.sleepAt).not.toBeNull();
  await waitFor(() => expect(screen.getByText("30 min left")).toBeTruthy());
  fireEvent.press(screen.getByTestId("player-sleep"));
  fireEvent.press(screen.getByTestId("sleep-end"));
  expect(handle.current!.sleepAt).toBeNull();
  expect(handle.current!.sleepAtEnd).toBe(true);
  expect(screen.getByText("Stops at the end")).toBeTruthy();
  fireEvent.press(screen.getByTestId("player-sleep"));
  fireEvent.press(screen.getByTestId("sleep-off"));
  expect(handle.current!.sleepAtEnd).toBe(false);
  expect(screen.getByText("Sleep timer")).toBeTruthy();
});
