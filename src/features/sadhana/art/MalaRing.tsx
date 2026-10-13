import React, { memo, useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { sanctum, shrine } from "../../../theme/tokens";
import { useReducedMotion } from "../../../components/useReducedMotion";
import type { MalaKind } from "../../../domain/mantras";

export const BEADS = 108;

export const malaColors: Record<
  MalaKind,
  { bead: string; shade: string; thread: string }
> = {
  rudraksha: { bead: "#8A4B2A", shade: "#4D2414", thread: "#C0281F" },
  tulsi: { bead: "#C9A877", shade: "#7D6236", thread: "#E9C46A" },
  chandan: { bead: "#D8B48A", shade: "#93673F", thread: "#C0281F" },
  lalChandan: { bead: "#A8392B", shade: "#5E1A12", thread: "#F3D58A" },
  sphatik: { bead: "#E8EEF2", shade: "#9FB3C2", thread: "#C0281F" },
};

const VIEW = 300;
const CENTER = VIEW / 2;
const RADIUS = 128;
// 108 beads plus the sumeru (guru bead) share 109 slots round the thread.
const SLOT = (Math.PI * 2) / (BEADS + 1);
// The sumeru hangs at the bottom with its tassel; counting runs clockwise.
const angleOf = (slot: number) => Math.PI / 2 + slot * SLOT;
const point = (slot: number, radius = RADIUS) => ({
  x: CENTER + Math.cos(angleOf(slot)) * radius,
  y: CENTER + Math.sin(angleOf(slot)) * radius,
});

const Bead = memo(function Bead({
  index,
  state,
  kind,
  shade,
}: {
  index: number;
  state: "done" | "current" | "ahead";
  kind: MalaKind;
  // Light tone (D-057): the id prefix of the ring's bead gradients.
  shade?: string;
}) {
  const { x, y } = point(index + 1);
  const colors = malaColors[kind];
  if (shade)
    return (
      <G>
        {state === "current" && (
          <Circle
            cx={x}
            cy={y}
            r={11}
            fill={shrine.saffronLight}
            opacity={0.7}
          />
        )}
        <Circle
          cx={x}
          cy={y}
          r={state === "current" ? 7.2 : 6.2}
          fill={`url(#${shade}${state === "ahead" ? "a" : "d"})`}
          stroke={state === "ahead" ? colors.shade : shrine.saffronDeep}
          strokeWidth={0.5}
        />
      </G>
    );
  if (state === "current")
    return (
      <G>
        <Circle cx={x} cy={y} r={11} fill={sanctum.ghee} opacity={0.35} />
        <Circle
          cx={x}
          cy={y}
          r={7.4}
          fill={colors.bead}
          stroke={sanctum.brassLight}
          strokeWidth={1.6}
        />
      </G>
    );
  return (
    <G>
      <Circle
        cx={x}
        cy={y}
        r={5.6}
        fill={state === "done" ? sanctum.brass : colors.bead}
        stroke={state === "done" ? sanctum.brassLight : colors.shade}
        strokeWidth={0.8}
      />
      <Circle
        cx={x - 1.6}
        cy={y - 1.6}
        r={1.5}
        fill="#FFFFFF"
        opacity={state === "done" ? 0.6 : 0.25}
      />
    </G>
  );
});

// The full mala, seen from above: the guru bead at the bottom, chanted beads
// turned to gold, the next bead glowing. `beads` is 0–107 within this mala.
// `completedKey` changes when a mala completes, to flash the sumeru.
export function MalaRing({
  beads,
  kind,
  size,
  completedKey,
  tone = "dark",
}: {
  beads: number;
  kind: MalaKind;
  size: number;
  completedKey: number;
  // "light": polished wooden beads on parchment, chanted ones gold (D-057).
  tone?: "dark" | "light";
}) {
  const shade = React.useId().replace(/:/g, "");
  const light = tone === "light";
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  useEffect(() => {
    if (completedKey === 0) return;
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: 1600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [completedKey, flash]);

  const colors = malaColors[kind];
  const sumeru = point(0);
  const scale = size / VIEW;
  const current = point(beads + 1);
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      {/* Sumeru flash on mala completion */}
      <Animated.View
        style={{
          position: "absolute",
          left: (sumeru.x - 60) * scale,
          top: (sumeru.y - 60) * scale,
          width: 120 * scale,
          height: 120 * scale,
          opacity: flash,
          transform: [
            {
              scale: flash.interpolate({
                inputRange: [0, 1],
                outputRange: [1.8, 0.6],
              }),
            },
          ],
        }}
      >
        <Glow />
      </Animated.View>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {light && (
          <Defs>
            <RadialGradient id={`${shade}a`} cx="35%" cy="35%" r="70%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
              <Stop offset="0.25" stopColor={colors.bead} />
              <Stop offset="1" stopColor={colors.shade} />
            </RadialGradient>
            <RadialGradient id={`${shade}d`} cx="35%" cy="35%" r="70%">
              <Stop offset="0" stopColor="#FFF6D8" />
              <Stop offset="0.35" stopColor={shrine.saffronLight} />
              <Stop offset="1" stopColor={shrine.saffronDeep} />
            </RadialGradient>
          </Defs>
        )}
        {/* Thread */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke={light ? shrine.gold : colors.thread}
          strokeWidth={1.4}
          fill="none"
          opacity={0.8}
        />
        {Array.from({ length: BEADS }, (_, index) => (
          <Bead
            key={index}
            index={index}
            kind={kind}
            shade={light ? shade : undefined}
            state={
              index < beads ? "done" : index === beads ? "current" : "ahead"
            }
          />
        ))}
        {/* Tassel (phundna) below the sumeru */}
        <G>
          {[-6, -3, 0, 3, 6].map((dx) => (
            <Line
              key={dx}
              x1={sumeru.x + dx * 0.4}
              y1={sumeru.y + 10}
              x2={sumeru.x + dx}
              y2={sumeru.y + 26}
              stroke={light ? shrine.saffron : colors.thread}
              strokeWidth={light ? 2.4 : 2}
              strokeLinecap="round"
            />
          ))}
          <Path
            d={`M${sumeru.x - 5} ${sumeru.y + 9} L ${sumeru.x + 5} ${sumeru.y + 9} L ${sumeru.x + 3} ${sumeru.y + 14} L ${sumeru.x - 3} ${sumeru.y + 14} Z`}
            fill={sanctum.brass}
          />
        </G>
        <Circle
          cx={sumeru.x}
          cy={sumeru.y}
          r={10.5}
          fill={light ? `url(#${shade}a)` : sanctum.brass}
          stroke={light ? shrine.gold : sanctum.brassLight}
          strokeWidth={1.5}
        />
        <Circle
          cx={sumeru.x - 3}
          cy={sumeru.y - 3}
          r={2.6}
          fill="#FFFFFF"
          opacity={0.55}
        />
      </Svg>
      {/* Gentle breathing ring on the next bead */}
      <Animated.View
        style={{
          position: "absolute",
          left: (current.x - 15) * scale,
          top: (current.y - 15) * scale,
          width: 30 * scale,
          height: 30 * scale,
          borderRadius: 15 * scale,
          borderWidth: 2,
          borderColor: light ? shrine.saffron : sanctum.brassLight,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.15, 0.7],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.85, 1.15],
              }),
            },
          ],
        }}
      />
    </View>
  );
}

function Glow() {
  const id = React.useId().replace(/:/g, "");
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={sanctum.ghee} stopOpacity={1} />
          <Stop offset="0.5" stopColor={sanctum.brass} stopOpacity={0.5} />
          <Stop offset="1" stopColor={sanctum.brass} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
    </Svg>
  );
}
