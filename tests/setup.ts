jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Icon geometry is checked by the real web bundle. Unit tests only need inert icon hosts.
jest.mock("lucide-react-native", () => {
  // Hoisted mock factories cannot reference module imports.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Icon = (props: object) => React.createElement(View, props);
  return new Proxy(
    {},
    { get: (_target, key) => (key === "__esModule" ? true : Icon) },
  );
});

// React Native Firebase needs native modules; the startup imports get fakes.
// (Auth and Firestore load lazily in cloud/emulator mode, which tests inject.)
jest.mock("@react-native-firebase/analytics", () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(async () => undefined),
}));
jest.mock("@react-native-firebase/remote-config", () => {
  const instance: {
    settings: object;
    defaultConfig: Record<string, string | boolean>;
  } = { settings: {}, defaultConfig: {} };
  return {
    getRemoteConfig: () => instance,
    fetchAndActivate: jest.fn(async () => false),
    getValue: (_config: unknown, key: string) => ({
      asBoolean: () => instance.defaultConfig[key] === true,
      asString: () => String(instance.defaultConfig[key] ?? ""),
    }),
  };
});

// expo-video needs its native module. The fake player keeps the state and
// events the UI reads; tests drive it through emit() and inspect the
// useVideoPlayer mock to see whether (and when) a player was created.
jest.mock("expo-video", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  type MockListener = (mockPayload?: unknown) => void;
  class MockVideoPlayer {
    listeners = new Map<string, Set<MockListener>>();
    status = "loading";
    playing = false;
    duration = 0;
    currentTime = 0;
    loop = false;
    timeUpdateEventInterval = 0;
    released = false;
    private mutedValue = false;
    source: unknown;
    constructor(mockSource: unknown) {
      this.source = mockSource;
    }
    get muted() {
      return this.mutedValue;
    }
    set muted(value: boolean) {
      this.mutedValue = value;
      this.emit("mutedChange", { muted: value });
    }
    addListener(event: string, listener: MockListener) {
      const set = this.listeners.get(event) ?? new Set<MockListener>();
      set.add(listener);
      this.listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    }
    emit(event: string, payload?: unknown) {
      if (event === "statusChange")
        this.status = (payload as { status: string }).status;
      if (event === "timeUpdate")
        this.currentTime = (payload as { currentTime: number }).currentTime;
      if (event === "playingChange")
        this.playing = (payload as { isPlaying: boolean }).isPlaying;
      this.listeners.get(event)?.forEach((listener) => listener(payload));
    }
    // Like the native player, commands only request a change; tests emit the
    // resulting playingChange/statusChange events themselves.
    play = jest.fn();
    pause = jest.fn();
    replay = jest.fn();
    release = jest.fn(() => {
      this.released = true;
    });
  }
  return {
    useVideoPlayer: jest.fn(
      (mockSource: unknown, setup?: (mockPlayer: MockVideoPlayer) => void) => {
        const ref = React.useRef(null);
        if (!ref.current) {
          ref.current = new MockVideoPlayer(mockSource);
          setup?.(ref.current);
        }
        React.useEffect(() => () => ref.current.release(), []);
        return ref.current;
      },
    ),
    VideoView: (props: object) => React.createElement(View, props),
  };
});

// Haptics need a native module; practice screens only fire and forget.
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

// expo-audio needs its native module; the Sadhana bell only plays and seeks.
// Player tests install their own richer fake.
jest.mock("expo-audio", () => ({
  createAudioPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    remove: jest.fn(),
    replace: jest.fn(),
    addListener: jest.fn(),
    playing: false,
  }),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

// Reanimated and Worklets official mocks (the puja scene animates with them).
jest.mock("react-native-worklets", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-native-worklets/src/mock"),
);
jest.mock("react-native-reanimated", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-native-reanimated/mock"),
);

// The Skia light/smoke layer needs native Skia; unit tests skip drawing it.
jest.mock("../src/features/sadhana/puja/Effects", () => ({
  PujaEffects: () => null,
}));
