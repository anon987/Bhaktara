import {
  SensorType,
  SharedValue,
  useAnimatedSensor,
  useDerivedValue,
} from "react-native-reanimated";

// How far the phone leans, from -1 to 1 on each axis, for the 2.5D parallax
// of the puja scene (D-054). Gravity, so it is steady when the phone is.
export function useTilt(enabled: boolean): {
  x: SharedValue<number>;
  y: SharedValue<number>;
} {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 33 });
  const x = useDerivedValue(() => {
    if (!enabled) return 0;
    return Math.max(-1, Math.min(1, -gravity.sensor.value.x / 9.81));
  });
  const y = useDerivedValue(() => {
    if (!enabled) return 0;
    // Phones are held tilted back; centre the parallax on that pose.
    return Math.max(-1, Math.min(1, (gravity.sensor.value.y - 6.5) / 6));
  });
  return { x, y };
}
