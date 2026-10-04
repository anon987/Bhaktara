jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Icon geometry is checked by the real web bundle. Unit tests only need inert icon hosts.
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = (props: object) => React.createElement(View, props);
  return new Proxy(
    {},
    { get: (_target, key) => (key === "__esModule" ? true : Icon) },
  );
});
