import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import type { Emitter } from "./Effects";

export type { Emitter } from "./Effects";

// Web preview: Skia's CanvasKit is not loaded here, so only the lamp's glow
// is shown (as SVG). The phone build draws light, smoke and water with Skia.
export function PujaEffects({
  width,
  lamp,
}: {
  width: number;
  height: number;
  lamp: Emitter;
  incense: Emitter[];
  smoking: boolean;
  deity: { x: number; y: number };
  waterKey: number;
}) {
  const size = width * 0.52;
  const style = useAnimatedStyle(() => ({
    opacity: lamp.on.value,
    transform: [
      { translateX: lamp.x.value - size / 2 },
      { translateY: lamp.y.value - size / 2 },
    ],
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[{ position: "absolute", width: size, height: size }, style]}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="lamp-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFE2A0" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#FFAA46" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#lamp-glow)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
