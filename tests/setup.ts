jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Profile photo and Google sign-in need native modules; the profile tests
// drive the app's own photo and account layers instead.
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: true,
    assets: null,
  })),
  CameraType: { front: "front", back: "back" },
}));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: "cancelled", data: null })),
    signOut: jest.fn(async () => null),
  },
  isErrorWithCode: () => false,
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
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
jest.mock("../src/features/mandir/puja/Effects", () => ({
  PujaEffects: () => null,
}));

// The AdMob SDK needs its native module. By default every rewarded ad fails
// to load (no fill), so app code never waits on the 5 s load timeout.
// tests/rewarded-ad.test.ts installs a controllable fake instead.
jest.mock("react-native-google-mobile-ads", () => ({
  __esModule: true,
  default: () => ({ initialize: jest.fn(async () => []) }),
  AdsConsent: {
    requestInfoUpdate: jest.fn(async () => ({ canRequestAds: true })),
  },
  AdEventType: { ERROR: "error", CLOSED: "closed" },
  RewardedAdEventType: {
    LOADED: "rewarded_loaded",
    EARNED_REWARD: "rewarded_earned_reward",
  },
  RewardedAd: {
    createForAdRequest: () => {
      let listener: ((event: { type: string }) => void) | undefined;
      return {
        addAdEventsListener: (next: typeof listener) => {
          listener = next;
          return () => undefined;
        },
        load: () => listener?.({ type: "error" }),
        show: jest.fn(async () => undefined),
        destroy: jest.fn(),
      };
    },
  },
}));
