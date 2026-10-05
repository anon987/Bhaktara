import React, { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { DevotionalArt } from "../../../components/DevotionalArt";
import { useReducedMotion } from "../../../components/useReducedMotion";
import { PujaStep } from "../../../domain/progression";
import { sanctum } from "../../../theme/tokens";
import { Diya } from "./Diya";
import { MarigoldShape } from "./Marigold";

// A small mandir with the chosen deity in the sanctum and an altar in front.
// Offerings appear on the altar as they are made (D-053). Geometry is in a
// 300 × 360 viewBox and scaled to `size` (the width).
export const SHRINE_VIEW = { width: 300, height: 360 };
// The sanctum opening holding the deity image.
export const SANCTUM = { x: 88, y: 123, width: 124, height: 177 };
export const deityCentre = {
  x: SANCTUM.x + SANCTUM.width / 2,
  y: SANCTUM.y + SANCTUM.height / 2,
};

export function Shrine({
  size,
  artKey,
  offered,
  glow,
  children,
}: React.PropsWithChildren<{
  size: number;
  artKey: string;
  offered: ReadonlySet<PujaStep>;
  glow: boolean;
}>) {
  const id = React.useId().replace(/:/g, "");
  const s = size / SHRINE_VIEW.width;
  const height = SHRINE_VIEW.height * s;
  const at = (x: number, y: number, w: number, h: number) => ({
    position: "absolute" as const,
    left: (x - w / 2) * s,
    top: (y - h) * s,
    width: w * s,
    height: h * s,
  });
  return (
    <View
      accessible={false}
      style={{ width: size, height, alignSelf: "center" }}
    >
      {glow && <Halo size={size} />}
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${SHRINE_VIEW.width} ${SHRINE_VIEW.height}`}
        style={{ position: "absolute" }}
      >
        <Defs>
          <LinearGradient id={`${id}st`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#D9833F" />
            <Stop offset="1" stopColor="#9C4A22" />
          </LinearGradient>
          <LinearGradient id={`${id}br`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sanctum.brassLight} />
            <Stop offset="1" stopColor={sanctum.brassDeep} />
          </LinearGradient>
        </Defs>
        {/* Shikhara with kalash and flag */}
        <Path
          d="M62 112 C 78 70, 118 34, 150 22 C 182 34, 222 70, 238 112 Z"
          fill={`url(#${id}st)`}
        />
        {[50, 70, 90].map((y) => (
          <Path
            key={y}
            d={`M${150 - (y - 18) * 0.95} ${y + 20} Q 150 ${y + 8} ${150 + (y - 18) * 0.95} ${y + 20}`}
            stroke="#F0B27A"
            strokeWidth={1.2}
            fill="none"
            opacity={0.7}
          />
        ))}
        <Line
          x1={150}
          y1={22}
          x2={150}
          y2={2}
          stroke={sanctum.brassDeep}
          strokeWidth={2}
        />
        <Path d="M151 2 L 172 8 L 151 14 Z" fill={sanctum.marigoldDeep} />
        <Ellipse cx={150} cy={22} rx={7} ry={5} fill={`url(#${id}br)`} />
        {/* Temple body */}
        <Rect x={50} y={108} width={200} height={194} rx={6} fill="#6E2A1C" />
        <Rect x={50} y={108} width={200} height={10} fill={`url(#${id}br)`} />
        {/* Pillars */}
        {[58, 222].map((x) => (
          <G key={x}>
            <Rect x={x} y={124} width={20} height={176} fill="#8C3B25" />
            <Rect
              x={x - 3}
              y={120}
              width={26}
              height={8}
              rx={2}
              fill={`url(#${id}br)`}
            />
            <Rect
              x={x - 3}
              y={292}
              width={26}
              height={8}
              rx={2}
              fill={`url(#${id}br)`}
            />
          </G>
        ))}
        {/* Sanctum opening (the deity view sits on top of it) */}
        <Path
          d={`M${SANCTUM.x - 4} 302 L${SANCTUM.x - 4} 172 Q ${SANCTUM.x - 4} ${SANCTUM.y - 6} 150 ${SANCTUM.y - 6} Q ${SANCTUM.x + SANCTUM.width + 4} ${SANCTUM.y - 6} ${SANCTUM.x + SANCTUM.width + 4} 172 L${SANCTUM.x + SANCTUM.width + 4} 302 Z`}
          fill={`url(#${id}br)`}
        />
        {/* Hanging bells */}
        {[40, 260].map((x) => (
          <G key={x}>
            <Line
              x1={x}
              y1={118}
              x2={x}
              y2={146}
              stroke={sanctum.brassDeep}
              strokeWidth={1.5}
            />
            <Path
              d={`M${x - 8} 160 C ${x - 8} 150, ${x - 5} 145, ${x} 145 C ${x + 5} 145, ${x + 8} 150, ${x + 8} 160 Z`}
              fill={`url(#${id}br)`}
            />
            <Circle cx={x} cy={162} r={2.2} fill={sanctum.brassDeep} />
          </G>
        ))}
        {/* Altar and steps */}
        <Rect
          x={28}
          y={300}
          width={244}
          height={26}
          rx={4}
          fill={`url(#${id}br)`}
        />
        <Rect x={16} y={326} width={268} height={18} rx={3} fill="#8C3B25" />
        <Rect x={6} y={344} width={288} height={14} rx={3} fill="#6E2A1C" />
        {/* Offerings on the altar */}
        {offered.has("pushp") && (
          <G>
            <MarigoldShape cx={92} cy={300} r={9} />
            <MarigoldShape cx={106} cy={296} r={8} />
            <MarigoldShape cx={100} cy={290} r={7} />
            <MarigoldShape cx={194} cy={300} r={8} />
          </G>
        )}
        {offered.has("dhoop") && (
          <G>
            <Ellipse cx={122} cy={301} rx={8} ry={3} fill={sanctum.brassDeep} />
            <Line
              x1={119}
              y1={300}
              x2={115}
              y2={270}
              stroke="#5B3A22"
              strokeWidth={2}
            />
            <Line
              x1={125}
              y1={300}
              x2={128}
              y2={270}
              stroke="#5B3A22"
              strokeWidth={2}
            />
            <Circle cx={115} cy={269} r={1.8} fill={sanctum.flame} />
            <Circle cx={128} cy={269} r={1.8} fill={sanctum.flame} />
          </G>
        )}
        {offered.has("naivedya") && (
          <G>
            <Path d="M166 292 Q 180 306 194 292 Z" fill={sanctum.brass} />
            {[171, 178, 185, 189, 175, 182].map((x, i) => (
              <Circle
                key={i}
                cx={x}
                cy={i < 4 ? 289 : 283}
                r={4}
                fill="#F2A93B"
                stroke="#D9861E"
                strokeWidth={0.6}
              />
            ))}
          </G>
        )}
      </Svg>
      {/* The deity in the sanctum */}
      <View
        style={{
          position: "absolute",
          left: SANCTUM.x * s,
          top: SANCTUM.y * s,
          width: SANCTUM.width * s,
          height: SANCTUM.height * s,
          borderTopLeftRadius: (SANCTUM.width / 2) * s,
          borderTopRightRadius: (SANCTUM.width / 2) * s,
          overflow: "hidden",
        }}
      >
        <DevotionalArt assetKey={artKey} size={SANCTUM.height * s} lit={glow} />
      </View>
      {offered.has("dhoop") && (
        <View style={at(122, 268, 40, 90)} pointerEvents="none">
          <Smoke />
        </View>
      )}
      {offered.has("deep") && (
        <View style={at(150, 304, 40, 40)} pointerEvents="none">
          <Diya size={40 * s} glow={0.6} />
        </View>
      )}
      {children}
    </View>
  );
}

// Incense smoke: soft wisps rising and fading.
function Smoke() {
  const reduced = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(rise, {
        toValue: 1,
        duration: 3600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, rise]);
  const wisp = (offset: number, key: number) => {
    const phase = Animated.modulo(Animated.add(rise, offset), 1);
    return (
      <Animated.View
        key={key}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "100%",
          opacity: phase.interpolate({
            inputRange: [0, 0.2, 0.8, 1],
            outputRange: [0, 0.7, 0.25, 0],
          }),
          transform: [
            {
              translateY: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [20, -30],
              }),
            },
            {
              scale: phase.interpolate({
                inputRange: [0, 1],
                outputRange: [0.8, 1.3],
              }),
            },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 40 90">
          <Path
            d="M20 88 C 10 70, 30 60, 20 44 C 12 32, 28 22, 20 6"
            stroke="#EDE3D6"
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    );
  };
  return (
    <View style={{ flex: 1 }}>
      {reduced ? wisp(0.4, 0) : [0, 0.33, 0.66].map((o, i) => wisp(o, i))}
    </View>
  );
}

// A warm, soft glow behind the shrine once the aarti is done.
function Halo({ size }: { size: number }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <Svg
      width={size * 1.3}
      height={size * 1.3}
      viewBox="0 0 100 100"
      style={{ position: "absolute", left: -size * 0.15, top: -size * 0.12 }}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={sanctum.ghee} stopOpacity={0.4} />
          <Stop offset="0.55" stopColor={sanctum.flame} stopOpacity={0.12} />
          <Stop offset="1" stopColor={sanctum.flame} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#${id})`} />
    </Svg>
  );
}
