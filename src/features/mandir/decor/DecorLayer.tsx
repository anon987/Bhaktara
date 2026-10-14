import React, { useEffect, useState } from "react";
import {
  Image,
  ImageLoadEventData,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { sanctum } from "../../../theme/tokens";
import { useTilt } from "../puja/useTilt";
import { MandirDecor } from "./decor";
import { bellBox, lightBoxes } from "./geometry";

const aspectOf = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
  const { width, height } = event.nativeEvent.source ?? {};
  return width && height ? width / height : undefined;
};

// The chosen light hung over the temple (top, bottom or both sides) with a
// gentle twinkle, and the chosen bell hanging from the top, swinging when it
// is rung. Both sit a little in front of the temple: they shift slightly as
// the phone tilts. Decorative only; never takes touches.
export function DecorLayer({
  width,
  height,
  light,
  bell,
  ringKey,
  reduced,
  ceiling,
}: {
  width: number;
  height: number;
  light: MandirDecor | null;
  bell: MandirDecor | null;
  ringKey: number;
  reduced: boolean;
  // The top of the murti: lights hung from the top stay above it.
  ceiling?: number;
}) {
  const tilt = useTilt(!reduced);
  const front = useAnimatedStyle(() => ({
    transform: [
      { translateX: tilt.x.value * 6 },
      { translateY: tilt.y.value * 3 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, front]}
    >
      {light && (
        <Lights
          ceiling={ceiling}
          key={light.id}
          width={width}
          height={height}
          light={light}
          reduced={reduced}
        />
      )}
      {bell && (
        <HangingBell
          key={bell.id}
          width={width}
          height={height}
          bell={bell}
          ringKey={ringKey}
          reduced={reduced}
        />
      )}
    </Animated.View>
  );
}

function Lights({
  width,
  height,
  light,
  reduced,
  ceiling,
}: {
  width: number;
  height: number;
  light: MandirDecor;
  reduced: boolean;
  ceiling?: number;
}) {
  const [measured, setMeasured] = useState<number | undefined>();
  const boxes = lightBoxes(
    width,
    height,
    light.placement ?? "top",
    light.aspect ?? measured ?? 1,
    ceiling,
  );
  // Opacity only, on the UI thread; still when motion is reduced.
  const glow = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(glow);
      glow.value = 1;
      return;
    }
    glow.value = withRepeat(
      withTiming(0.72, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(glow);
  }, [reduced, glow]);
  const twinkle = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View
      testID="decor-light"
      style={[StyleSheet.absoluteFill, twinkle]}
    >
      {boxes.map((box, i) => (
        <Image
          key={i}
          accessible={false}
          source={light.image}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={
            light.aspect || i > 0
              ? undefined
              : (event) => setMeasured(aspectOf(event))
          }
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            // Sides: the right one is the left one mirrored.
            ...(i === 1 ? { transform: [{ scaleX: -1 }] } : {}),
          }}
        />
      ))}
    </Animated.View>
  );
}

function HangingBell({
  width,
  height,
  bell,
  ringKey,
  reduced,
}: {
  width: number;
  height: number;
  bell: MandirDecor;
  ringKey: number;
  reduced: boolean;
}) {
  const box = bellBox(width, height);
  const swing = useSharedValue(0);
  useEffect(() => {
    if (ringKey === 0 || reduced) return;
    const ease = { easing: Easing.inOut(Easing.sin) };
    swing.value = withSequence(
      withTiming(1, { duration: 160, ...ease }),
      withTiming(-0.75, { duration: 300, ...ease }),
      withTiming(0.5, { duration: 280, ...ease }),
      withTiming(-0.3, { duration: 260, ...ease }),
      withTiming(0.12, { duration: 240, ...ease }),
      withTiming(0, { duration: 220, ...ease }),
    );
  }, [ringKey, reduced, swing]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${swing.value * 20}deg` }],
  }));
  return (
    <Animated.View
      testID="decor-bell"
      style={[
        {
          position: "absolute",
          left: box.x,
          top: 0,
          width: box.width,
          height: box.chain + box.height,
          alignItems: "center",
          // Swings from the top of the chain.
          transformOrigin: "50% 0%",
        },
        style,
      ]}
    >
      <View style={[styles.chain, { height: box.chain + 4 }]} />
      <Image
        accessible={false}
        source={bell.image}
        resizeMode="contain"
        fadeDuration={0}
        style={{ width: box.width, height: box.height, marginTop: -4 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chain: { width: 3, borderRadius: 1.5, backgroundColor: sanctum.brassDeep },
});
