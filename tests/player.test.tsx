import React, { useEffect } from "react";
import { Image, ScrollView, Share, StyleSheet, Text } from "react-native";
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
import {
  computePlayerLayout,
  MIN_ART_SIZE,
  playerFixedHeight,
} from "../src/features/player/playerLayout";

type ReactTestInstance = ReturnType<ReturnType<typeof render>["getByTestId"]>;

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

// Everything under the artwork element, found by testID.
const insideArt = (screen: ReturnType<typeof render>, testID: string) =>
  screen
    .getByTestId("player-art")
    .findAll((node: ReactTestInstance) => node.props.testID === testID).length >
  0;
const opacityOf = (screen: ReturnType<typeof render>) =>
  StyleSheet.flatten(screen.getByTestId("player-art-image").props.style)
    .opacity;

test("the lyrics show over the faded artwork, without the section notes", async () => {
  // The app is in English and the Hinglish lyrics are empty: Hindi is shown.
  const screen = await renderPlayerScreen({
    ...streamable,
    lyrics: { hi: sampleLyrics, en: "" },
  });
  expect(insideArt(screen, "player-lyrics")).toBe(true);
  expect(insideArt(screen, "player-lyrics-scroll")).toBe(true);
  expect(opacityOf(screen)).toBeLessThanOrEqual(0.3);
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
  // The lyrics scroll is the only scroll view: the page itself doesn't scroll.
  const scrolls = screen.UNSAFE_queryAllByType(ScrollView);
  expect(scrolls).toHaveLength(1);
  expect(scrolls[0].props.testID).toBe("player-lyrics-scroll");
});

test("the lyrics toggle hides and shows the lyrics over the art", async () => {
  const screen = await renderPlayerScreen({
    ...streamable,
    lyrics: { hi: sampleLyrics, en: "" },
  });
  const toggle = screen.getByTestId("player-lyrics-toggle");
  expect(toggle.props.accessibilityLabel).toBe("Hide lyrics");
  expect(toggle.props.accessibilityState).toEqual({ selected: true });
  fireEvent.press(toggle);
  expect(screen.queryByTestId("player-lyrics")).toBeNull();
  expect(opacityOf(screen)).toBeUndefined();
  // Back to the art's own shape.
  expect(
    StyleSheet.flatten(screen.getByTestId("player-art").props.style)
      .aspectRatio,
  ).toBe(1);
  const shown = screen.getByTestId("player-lyrics-toggle");
  expect(shown.props.accessibilityLabel).toBe("Show lyrics");
  fireEvent.press(shown);
  expect(screen.getByTestId("player-lyrics")).toBeTruthy();
  expect(opacityOf(screen)).toBeLessThanOrEqual(0.3);
});

test("the player prefers the app language, and shows no lyrics or toggle without them", async () => {
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
  expect(screen.queryByTestId("player-lyrics-toggle")).toBeNull();
  expect(opacityOf(screen)).toBeUndefined();
  expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
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

test("the controls row has repeat, and no favourite or sleep timer", async () => {
  const screen = await renderPlayerScreen(streamable);
  act(() => mockAudio.listener!(status({ currentTime: 10 })));
  const row = screen.getByTestId("player-controls");
  const ids = row
    .findAll((node: ReactTestInstance) => typeof node.props.testID === "string")
    .map((node: ReactTestInstance) => node.props.testID as string);
  expect(ids).toContain("player-repeat");
  expect(ids).toContain("player-toggle");
  expect(screen.queryByTestId("player-favorite")).toBeNull();
  expect(screen.queryByTestId("player-sleep")).toBeNull();
  expect(screen.queryByText(/Favorite|Sleep timer/)).toBeNull();
  expect(screen.queryByLabelText(/favorites/)).toBeNull();
  const repeat = screen.getByTestId("player-repeat");
  expect(repeat.props.accessibilityState).toEqual({ selected: false });
  fireEvent.press(repeat);
  expect(handle.current!.repeat).toBe(true);
  expect(screen.getByTestId("player-repeat").props.accessibilityState).toEqual({
    selected: true,
  });
  expect(screen.getByTestId("player-repeat").props.accessibilityLabel).toBe(
    "Repeat: This bhajan will play again and again",
  );
  fireEvent.press(screen.getByTestId("player-repeat"));
  expect(handle.current!.repeat).toBe(false);
});

test("share is an icon button on the artwork", async () => {
  const share = jest
    .spyOn(Share, "share")
    .mockResolvedValue({ action: Share.sharedAction });
  const screen = await renderPlayerScreen(streamable);
  expect(insideArt(screen, "player-share")).toBe(true);
  const button = screen.getByTestId("player-share");
  expect(button.props.accessibilityLabel).toBe("Share this bhajan");
  await act(async () => {
    fireEvent.press(button);
    await Promise.resolve();
  });
  expect(share).toHaveBeenCalledWith({
    message: "Listen to “A morning with Krishna” on Bhaktara.",
  });
  expect(analytics.track).toHaveBeenCalledWith("content_share", {
    content_id: "bhajan-stream",
    content_type: streamable.type,
    channel: "other",
  });
});

describe("computePlayerLayout", () => {
  const noInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  const phoneInsets = { top: 24, bottom: 0, left: 0, right: 0 };
  test.each([
    ["square art", 1, noInsets],
    ["16:9 art", 16 / 9, noInsets],
    ["square art under a status bar", 1, phoneInsets],
    ["16:9 art under a status bar", 16 / 9, phoneInsets],
  ])("leaves room for the controls on 360×640 (%s)", (_, ratio, insets) => {
    const layout = computePlayerLayout({
      width: 360,
      height: 640,
      insets,
      ratio,
    });
    expect(layout.artHeight).toBeGreaterThanOrEqual(MIN_ART_SIZE);
    expect(layout.artWidth / layout.artHeight).toBeCloseTo(ratio, 1);
    expect(layout.artWidth).toBeLessThanOrEqual(360 - 40 - 10);
    expect(layout.usedHeight).toBeLessThanOrEqual(640 - insets.top);
    expect(
      playerFixedHeight(layout.titleLines) + layout.artHeight,
    ).toBeLessThanOrEqual(640 - insets.top);
  });
  test("the art grows on tall phones and two-line titles fit", () => {
    const short = computePlayerLayout({
      width: 360,
      height: 640,
      insets: phoneInsets,
      ratio: 1,
    });
    const tall = computePlayerLayout({
      width: 360,
      height: 800,
      insets: phoneInsets,
      ratio: 1,
    });
    expect(tall.artHeight).toBeGreaterThan(short.artHeight);
    expect(tall.titleLines).toBe(2);
    // Square art is capped by the page width.
    expect(tall.artWidth).toBe(360 - 40 - 10);
  });
  test("titles cut to one line before the art goes under the minimum", () => {
    const layout = computePlayerLayout({
      width: 360,
      height: 600,
      insets: { top: 24, bottom: 48, left: 0, right: 0 },
      ratio: 1,
    });
    expect(layout.titleLines).toBe(1);
    expect(layout.artHeight).toBeGreaterThanOrEqual(MIN_ART_SIZE);
  });
  test("with lyrics the frame takes all the space left over", () => {
    const layout = computePlayerLayout({
      width: 360,
      height: 640,
      insets: phoneInsets,
      ratio: 16 / 9,
      fill: true,
    });
    expect(layout.artWidth).toBe(360 - 40 - 10);
    expect(layout.usedHeight).toBe(640 - 24);
  });
});
