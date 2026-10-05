import { SharedValue, useSharedValue } from "react-native-reanimated";

// The web preview has no motion sensor: the scene stays level.
export function useTilt(_enabled: boolean): {
  x: SharedValue<number>;
  y: SharedValue<number>;
} {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  return { x, y };
}
