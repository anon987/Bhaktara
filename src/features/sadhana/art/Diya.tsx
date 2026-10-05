import React, { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { useReducedMotion } from "../../../components/useReducedMotion";

// A clay diya with a living flame. `glow` (0–1) grows the flame's halo, e.g.
// with the streak. Decorative: callers give the meaning in text.
export function Diya({
  size = 96,
  lit = true,
  glow = 0.5,
}: {
  size?: number;
  lit?: boolean;
  glow?: number;
}) {
  const id = React.useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [flicker] = useState(() => new Animated.Value(0));
  const [breathe] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!lit || reduced) return;
    // Two unsynchronised loops read as a natural, never-repeating flicker.
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0.3,
          duration: 260,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0.8,
          duration: 340,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: 380,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [lit, reduced, flicker, breathe]);

  const flameW = size * 0.3;
  const flameH = size * 0.46;
  const halo = size * (0.9 + glow * 0.5);
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ width: size, height: size, alignItems: "center" }}
    >
      {lit && (
        <Animated.View
          style={{
            position: "absolute",
            width: halo,
            height: halo,
            top: size * 0.32 - halo / 2,
            opacity: breathe.interpolate({
              inputRange: [0, 1],
              outputRange: [0.55 + glow * 0.2, 0.9],
            }),
            transform: [
              {
                scale: breathe.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1.06],
                }),
              },
            ],
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sanctum.ghee} stopOpacity={0.75} />
                <Stop
                  offset="0.45"
                  stopColor={sanctum.flame}
                  stopOpacity={0.28}
                />
                <Stop offset="1" stopColor={sanctum.flame} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill={`url(#${id}h)`} />
          </Svg>
        </Animated.View>
      )}
      <Svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ position: "absolute", top: 0 }}
      >
        <Defs>
          <LinearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sanctum.clay} />
            <Stop offset="1" stopColor={sanctum.clayDark} />
          </LinearGradient>
        </Defs>
        {/* Foot */}
        <Ellipse cx="50" cy="90" rx="17" ry="4" fill={sanctum.clayDark} />
        {/* Bowl */}
        <Path
          d="M8 62 C 12 80, 30 89, 50 89 C 70 89, 88 80, 92 62 Z"
          fill={`url(#${id}c)`}
        />
        {/* Painted band: kumkum dots and a white rangoli line */}
        <Path
          d="M16 70 Q 50 82 84 70"
          stroke={sanctum.ghee}
          strokeWidth="1.6"
          fill="none"
          strokeDasharray="3 3"
          opacity={0.85}
        />
        {[22, 34, 50, 66, 78].map((x, i) => (
          <Circle
            key={x}
            cx={x}
            cy={i === 2 ? 79 : 76}
            r="2.2"
            fill={sanctum.kumkum}
          />
        ))}
        {/* Rim and ghee */}
        <Ellipse cx="50" cy="62" rx="42" ry="7.5" fill={sanctum.clayDark} />
        <Ellipse
          cx="50"
          cy="62"
          rx="36"
          ry="5"
          fill={lit ? "#E7B862" : "#7C4A2A"}
        />
        {/* Wick */}
        <Path
          d="M48 62 Q 50 55 51 51"
          stroke="#3A2416"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      {lit && (
        <Animated.View
          style={{
            position: "absolute",
            width: flameW,
            height: flameH,
            top: size * 0.55 - flameH,
            transform: [
              { translateY: flameH / 2 },
              {
                scaleY: flicker.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.9, 1.08],
                }),
              },
              {
                scaleX: flicker.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.04, 0.94],
                }),
              },
              {
                rotate: flicker.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-2deg", "3deg"],
                }),
              },
              { translateY: -flameH / 2 },
            ],
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 40 60">
            <Defs>
              <LinearGradient id={`${id}f`} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={sanctum.kumkum} />
                <Stop offset="0.35" stopColor={sanctum.flame} />
                <Stop offset="1" stopColor={sanctum.ghee} />
              </LinearGradient>
            </Defs>
            <Path
              d="M20 1 C 29 17, 37 31, 32 45 C 28 57, 12 57, 8 45 C 3 31, 11 17, 20 1 Z"
              fill={`url(#${id}f)`}
            />
            <Path
              d="M20 22 C 25 32, 27 40, 24 47 C 22 52, 18 52, 16 47 C 13 40, 15 32, 20 22 Z"
              fill={sanctum.flameCore}
              opacity={0.95}
            />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
