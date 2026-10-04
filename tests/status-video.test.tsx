import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useVideoPlayer } from "expo-video";
import { AppProvider } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Content } from "../src/domain/models";
import { StatusVideo } from "../src/features/content/StatusVideo";
import { analytics } from "../src/services/analytics";
import { localStore, initialState } from "../src/services/storage/localStore";

// Stands in for a build with EXPO_PUBLIC_MEDIA_BASE_URL set.
jest.mock("../src/services/media/config", () => {
  const { mediaUrl } = jest.requireActual("../src/domain/media");
  return {
    setRuntimeMediaBaseUrl: jest.fn(),
    resolveMediaUrl: (key: string) =>
      mediaUrl("https://media-dev.example.com", key),
  };
});
let mockFocused = true;
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: () => mockFocused,
}));

type FakePlayer = {
  source: unknown;
  duration: number;
  released: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  replay: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
};
const createPlayer = jest.mocked(useVideoPlayer);
const players = () =>
  [
    ...new Set(createPlayer.mock.results.map((result) => result.value)),
  ] as FakePlayer[];

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function Wrapper({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <DialogProvider>{children}</DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
const status = (media: Content["media"]): Content => ({
  id: "status-7",
  type: "STATUS",
  title: { en: "Morning darshan", hi: "प्रातः दर्शन" },
  description: { en: "", hi: "" },
  deityIds: ["krishna"],
  searchTokens: [],
  media,
  durationSeconds: 20,
  saveGate: "REWARDED",
  isShareable: true,
});
const cdn = status({
  thumb: { key: "status/status-7/thumb.0a1b2c3d.webp" },
  poster: { key: "status/status-7/poster.0a1b2c3d.webp" },
  video720: { key: "status/status-7/video720.0a1b2c3d.mp4" },
});
const params = {
  content_id: "status-7",
  content_type: "STATUS",
  deity_id: "krishna",
  source: "home_rail",
};

let track: jest.SpyInstance;
beforeEach(() => {
  mockFocused = true;
  createPlayer.mockClear();
  track = jest.spyOn(analytics, "track").mockImplementation(() => undefined);
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("placeholder media shows a not-available message and never builds a player", async () => {
  const screen = render(
    <StatusVideo
      content={status({ thumb: { key: "placeholder/krishna" } })}
      source="explore"
    />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getByText("This video isn’t available yet.")).toBeTruthy(),
  );
  expect(screen.queryByLabelText("Play video")).toBeNull();
  // A video key without a CDN URL is just as unplayable.
  screen.rerender(
    <StatusVideo
      content={status({
        thumb: { key: "placeholder/krishna" },
        video720: { key: "placeholder/krishna-video" },
      })}
      source="explore"
    />,
  );
  expect(screen.getByText("This video isn’t available yet.")).toBeTruthy();
  expect(createPlayer).not.toHaveBeenCalled();
  expect(track).not.toHaveBeenCalled();
});

test("the poster shows first and the video loads only after a tap", async () => {
  const screen = render(<StatusVideo content={cdn} source="home_rail" />, {
    wrapper: Wrapper,
  });
  const play = await screen.findByLabelText("Play video");
  expect(createPlayer).not.toHaveBeenCalled();
  fireEvent.press(play);
  expect(players()).toHaveLength(1);
  const [player] = players();
  expect(player.source).toBe(
    "https://media-dev.example.com/status/status-7/video720.0a1b2c3d.mp4",
  );
  expect(player.play).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Loading video…")).toBeTruthy();
  // Tapping or loading alone is not a play.
  expect(track).not.toHaveBeenCalled();

  // Leaving the screen pauses; unmounting releases the native player.
  mockFocused = false;
  screen.rerender(<StatusVideo content={cdn} source="home_rail" />);
  expect(player.pause).toHaveBeenCalled();
  screen.unmount();
  expect(player.released).toBe(true);
});

test("content_play and content_complete fire once per open, even across retries", async () => {
  const screen = render(<StatusVideo content={cdn} source="home_rail" />, {
    wrapper: Wrapper,
  });
  fireEvent.press(await screen.findByLabelText("Play video"));
  const [player] = players();
  player.duration = 20;
  act(() => {
    player.emit("statusChange", { status: "readyToPlay" });
    player.emit("playingChange", { isPlaying: true });
  });
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenLastCalledWith("content_play", params);

  // Tap toggles pause; resuming is not a new play.
  fireEvent.press(screen.getByLabelText("Pause video"));
  expect(player.pause).toHaveBeenCalled();
  act(() => player.emit("playingChange", { isPlaying: false }));
  fireEvent.press(screen.getByLabelText("Play video"));
  act(() => {
    player.emit("playingChange", { isPlaying: true });
    player.emit("timeUpdate", { currentTime: 10 });
  });
  expect(track).toHaveBeenCalledTimes(1);

  act(() => player.emit("timeUpdate", { currentTime: 16 }));
  expect(track).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenLastCalledWith("content_complete", params);
  act(() => {
    player.emit("timeUpdate", { currentTime: 19 });
    player.emit("playingChange", { isPlaying: false });
    player.emit("playToEnd");
  });
  expect(track).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByLabelText("Play again"));
  expect(player.replay).toHaveBeenCalledTimes(1);

  // A failure offers a retry, which builds a fresh player.
  act(() =>
    player.emit("statusChange", {
      status: "error",
      error: { message: "network" },
    }),
  );
  expect(
    screen.getByText(
      "This video couldn’t play. Check your internet connection and try again.",
    ),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Try again"));
  expect(player.released).toBe(true);
  expect(players()).toHaveLength(2);
  const retried = players()[1];
  retried.duration = 20;
  act(() => {
    retried.emit("statusChange", { status: "readyToPlay" });
    retried.emit("playingChange", { isPlaying: true });
    retried.emit("timeUpdate", { currentTime: 18 });
  });
  expect(track).toHaveBeenCalledTimes(2);
});

test("the mute toggle flips the player's sound", async () => {
  const screen = render(<StatusVideo content={cdn} source="explore" />, {
    wrapper: Wrapper,
  });
  fireEvent.press(await screen.findByLabelText("Play video"));
  fireEvent.press(screen.getByLabelText("Mute"));
  expect(screen.getByLabelText("Unmute")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Unmute"));
  expect(screen.getByLabelText("Mute")).toBeTruthy();
});
