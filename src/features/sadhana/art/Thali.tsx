import React, { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { useReducedMotion } from "../../../components/useReducedMotion";
import { MarigoldShape } from "./Marigold";
import { Diya } from "./Diya";

// The offerings placed on the thali, in prayer-step order.
export const offerings = [
  "pushp",
  "deep",
  "dhoop",
  "akshat",
  "ghanti",
] as const;
export type Offering = (typeof offerings)[number];
export const offeringFor = (index: number): Offering =>
  offerings[index % offerings.length];

const VIEW = 200;

function OfferingArt({ kind, x, y }: { kind: Offering; x: number; y: number }) {
  switch (kind) {
    case "pushp":
      return (
        <G>
          <MarigoldShape cx={x - 9} cy={y + 4} r={11} />
          <MarigoldShape cx={x + 9} cy={y + 2} r={10} />
          <MarigoldShape cx={x} cy={y - 8} r={10} />
        </G>
      );
    case "dhoop":
      return (
        <G>
          <Ellipse
            cx={x}
            cy={y + 12}
            rx={9}
            ry={3.5}
            fill={sanctum.brassDeep}
          />
          <Line
            x1={x - 4}
            y1={y + 11}
            x2={x - 9}
            y2={y - 14}
            stroke="#5B3A22"
            strokeWidth={2}
          />
          <Line
            x1={x + 3}
            y1={y + 11}
            x2={x + 6}
            y2={y - 14}
            stroke="#5B3A22"
            strokeWidth={2}
          />
          <Circle cx={x - 9} cy={y - 15} r={1.8} fill={sanctum.flame} />
          <Circle cx={x + 6} cy={y - 15} r={1.8} fill={sanctum.flame} />
          <Path
            d={`M${x - 9} ${y - 17} c -5 -6, 5 -9, 0 -16 c -4 -5, 4 -8, 1 -12`}
            stroke="#E8DCCB"
            strokeWidth={1.4}
            fill="none"
            opacity={0.7}
          />
        </G>
      );
    case "akshat":
      return (
        <G>
          <Ellipse cx={x} cy={y + 4} rx={15} ry={8} fill={sanctum.brassDeep} />
          <Ellipse cx={x} cy={y + 1} rx={13} ry={5} fill="#F4EBDD" />
          <Circle cx={x} cy={y} r={4} fill={sanctum.kumkum} />
        </G>
      );
    case "ghanti":
      return (
        <G>
          <Path
            d={`M${x - 11} ${y + 10} C ${x - 10} ${y - 4}, ${x - 6} ${y - 10}, ${x} ${y - 10} C ${x + 6} ${y - 10}, ${x + 10} ${y - 4}, ${x + 11} ${y + 10} Z`}
            fill={sanctum.brass}
            stroke={sanctum.brassDeep}
          />
          <Line
            x1={x}
            y1={y - 10}
            x2={x}
            y2={y - 18}
            stroke={sanctum.brassDeep}
            strokeWidth={3}
          />
          <Circle cx={x} cy={y + 12} r={2.6} fill={sanctum.brassDeep} />
        </G>
      );
    default:
      return null;
  }
}

// A brass puja thali. Each completed prayer step places its offering;
// `aarti` circles a lamp round the plate once everything is offered.
export function Thali({
  size,
  offered,
  slots,
  aarti,
}: {
  size: number;
  offered: boolean[];
  slots: Offering[];
  aarti: boolean;
}) {
  const id = React.useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!aarti || reduced) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [aarti, reduced, spin]);
  const scale = size / VIEW;
  const positions = slots.map((_, i) => {
    const angle = -Math.PI / 2 + (i / slots.length) * Math.PI * 2;
    return { x: 100 + Math.cos(angle) * 52, y: 100 + Math.sin(angle) * 52 };
  });
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <Defs>
          <RadialGradient id={id} cx="45%" cy="40%" r="60%">
            <Stop offset="0" stopColor={sanctum.brassLight} />
            <Stop offset="0.65" stopColor={sanctum.brass} />
            <Stop offset="1" stopColor={sanctum.brassDeep} />
          </RadialGradient>
        </Defs>
        <Circle cx={100} cy={104} r={92} fill="#000" opacity={0.25} />
        <Circle cx={100} cy={100} r={92} fill={`url(#${id})`} />
        <Circle
          cx={100}
          cy={100}
          r={82}
          fill="none"
          stroke={sanctum.brassDeep}
          strokeWidth={1.2}
        />
        {/* Engraved rim */}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return (
            <Circle
              key={i}
              cx={100 + Math.cos(a) * 87}
              cy={100 + Math.sin(a) * 87}
              r={1.6}
              fill={sanctum.brassDeep}
            />
          );
        })}
        {/* Kumkum lotus at the centre */}
        {Array.from({ length: 8 }, (_, i) => (
          <Ellipse
            key={i}
            cx={100}
            cy={88}
            rx={5}
            ry={12}
            fill={sanctum.kumkum}
            opacity={0.85}
            rotation={i * 45}
            origin="100, 100"
          />
        ))}
        <Circle cx={100} cy={100} r={6} fill={sanctum.marigold} />
        {slots.map((kind, i) =>
          offered[i] && kind !== "deep" ? (
            <OfferingArt
              key={i}
              kind={kind}
              x={positions[i].x}
              y={positions[i].y}
            />
          ) : !offered[i] ? (
            <Circle
              key={i}
              cx={positions[i].x}
              cy={positions[i].y}
              r={13}
              fill="none"
              stroke={sanctum.brassDeep}
              strokeDasharray="3 4"
              strokeWidth={1.4}
            />
          ) : null,
        )}
      </Svg>
      {/* The lamp is a live flame, so it is a view above the plate. */}
      {slots.map((kind, i) =>
        kind === "deep" && offered[i] ? (
          <View
            key={i}
            style={{
              position: "absolute",
              left: (positions[i].x - 18) * scale,
              top: (positions[i].y - 24) * scale,
            }}
          >
            <Diya size={36 * scale} glow={0.4} />
          </View>
        ) : null,
      )}
      {aarti && (
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            transform: [
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          }}
        >
          <View
            style={{
              position: "absolute",
              top: -size * 0.08,
              left: size / 2 - size * 0.11,
            }}
          >
            <Diya size={size * 0.22} glow={1} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}
