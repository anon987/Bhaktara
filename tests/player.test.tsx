import React, { useEffect } from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
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
