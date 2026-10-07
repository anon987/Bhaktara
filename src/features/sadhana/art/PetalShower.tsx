import React, { useEffect, useMemo } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { useReducedMotion } from "../../../components/useReducedMotion";

const colors = [
  sanctum.marigold,
  sanctum.marigoldDeep,
  "#E8475B",
  "#F7C948",
  sanctum.kumkum,
];

// Small deterministic PRNG (mulberry32).
function seeded(seed: number) {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pushpa vrishti: a shower of marigold and rose petals, played each time
// `trigger` changes (not on mount). Purely decorative; never blocks touches.
export function PetalShower({
  trigger,
  count = 22,
}: {
  trigger: number;
  count?: number;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  // Seeded by the trigger: each shower differs, and render stays pure.
  const petals = useMemo(() => {
    const random = seeded(trigger);
    return Array.from({ length: count }, (_, i) => ({
      x: random() * width,
      sway: 18 + random() * 40,
      delay: random() * 600,
      duration: 2400 + random() * 1400,
      size: 12 + random() * 10,
      spin: (random() > 0.5 ? 1 : -1) * (180 + random() * 360),
      color: colors[i % colors.length],
      progress: new Animated.Value(0),
    }));
  }, [trigger, count, width]);
  useEffect(() => {
    if (trigger === 0 || reduced) return;
    const animations = petals.map((petal) =>
      Animated.timing(petal.progress, {
        toValue: 1,
        duration: petal.duration,
        delay: petal.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
    return () => animations.forEach((animation) => animation.stop());
  }, [petals, trigger, reduced]);
  if (trigger === 0 || reduced) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessible={false}
    >
      {petals.map((petal, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: petal.x,
            top: -30,
            opacity: petal.progress.interpolate({
              inputRange: [0, 0.1, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: petal.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height + 60],
                }),
              },
              {
                translateX: petal.progress.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: [0, petal.sway, 0, -petal.sway, 0],
                }),
              },
              {
                rotate: petal.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", `${petal.spin}deg`],
                }),
              },
            ],
          }}
        >
          <Svg width={petal.size} height={petal.size} viewBox="0 0 20 20">
            <Path
              d="M10 1 C 17 5, 18 13, 10 19 C 2 13, 3 5, 10 1 Z"
              fill={petal.color}
            />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}
