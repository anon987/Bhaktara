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
