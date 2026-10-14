import {
  SensorType,
  SharedValue,
  useAnimatedReaction,
  useAnimatedSensor,
  useSharedValue,
} from "react-native-reanimated";

// Below this change (of a -1…1 range) the parallax does not move: sensor
// noise on a phone lying still would otherwise restyle the scene ~30 times a
// second and keep it redrawing while nothing visibly changes.
const DEAD_BAND = 0.02;

// How far the phone leans, from -1 to 1 on each axis, for the 2.5D parallax
// of the puja scene (D-054). Gravity, so it is steady when the phone is.
export function useTilt(enabled: boolean): {
  x: SharedValue<number>;
  y: SharedValue<number>;
} {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 33 });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  useAnimatedReaction(
    () => {
      if (!enabled) return [0, 0];
      const g = gravity.sensor.value;
      return [
        Math.max(-1, Math.min(1, -g.x / 9.81)),
        // Phones are held tilted back; centre the parallax on that pose.
        Math.max(-1, Math.min(1, (g.y - 6.5) / 6)),
      ];
    },
    ([nx, ny]) => {
      if (Math.abs(nx - x.value) > DEAD_BAND) x.value = nx;
      if (Math.abs(ny - y.value) > DEAD_BAND) y.value = ny;
    },
    [enabled],
  );
  return { x, y };
}
