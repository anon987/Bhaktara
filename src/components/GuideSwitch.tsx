import React, { useEffect, useState } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { Pointer } from "lucide-react-native";
import { useReducedMotion } from "./useReducedMotion";
import { colors } from "../theme/tokens";
import { Txt } from "./ui";

const useNativeDriver = Platform.OS !== "web";

// A demonstration of the switch the user must turn on in Android's
// "Modify system settings" screen: it slides to ON while a hand taps it, on a
// slow loop. Reduced motion shows the finished ON state instead.
export function GuideSwitch({
  width = 96,
  label,
}: {
  width?: number;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(progress, {
          toValue: 1,
          duration: 380,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver,
        }),
        Animated.delay(1600),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1,
          useNativeDriver,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduced]);
  const height = Math.round(width * 0.56);
  const knob = height - 10;
  const travel = width - knob - 10;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignItems: "center", gap: 6 }}
    >
      <View
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: colors.line,
          overflow: "hidden",
        }}
      >
        {/* The ON colour fades in over the OFF track. */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.green,
            opacity: progress,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            top: 5,
            left: 5,
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            backgroundColor: colors.white,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, travel],
                }),
              },
            ],
          }}
        />
      </View>
      {/* A hand pressing the switch: it presses down just before it turns on. */}
      <Animated.View
        style={{
          position: "absolute",
          top: height * 0.45,
          left: width * 0.62,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [6, 0, 0],
              }),
            },
          ],
        }}
      >
        <Pointer size={Math.round(height * 0.8)} color={colors.ink} />
      </Animated.View>
      {label && (
        <Animated.View style={{ opacity: progress, marginTop: 4 }}>
          <Txt
            bold
            size={Math.max(14, Math.round(width / 6))}
            style={{ color: colors.green }}
          >
            {label}
          </Txt>
        </Animated.View>
      )}
    </View>
  );
}
