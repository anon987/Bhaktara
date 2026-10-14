import React, { memo, useState } from "react";
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { useApp } from "../../../app/providers/AppProvider";
import { resolveMediaUrl } from "../../../services/media/config";
import { fonts, serif, shrine } from "../../../theme/tokens";
import { MangoLeaf, MarigoldBlooms } from "../art/Marigold";

// An image chosen in the admin panel (D-057), or the app's own drawing when
// the slot is empty, the CDN is not configured or the image fails to load.
export function SlotImage({
  assetKey,
  style,
  resizeMode = "contain",
  fallback = null,
}: {
  assetKey: string | undefined;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  fallback?: React.ReactNode;
}) {
  const uri = assetKey ? resolveMediaUrl(assetKey) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) return <>{fallback}</>;
  return (
    <Image
      accessible={false}
      source={{ uri }}
      resizeMode={resizeMode}
      onError={() => setFailed(uri)}
      style={style}
    />
  );
}

// Maroon serif heading (English) or Noto Devanagari (Hindi).
export function SerifText({
  size,
  bold = true,
  color = shrine.maroon,
  style,
  ...props
}: TextProps & { size: number; bold?: boolean; color?: string }) {
  const { local } = useApp();
  const hindi = local.language === "hi";
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: hindi
            ? bold
              ? fonts.hiBold
              : fonts.hi
            : Platform.select(serif),
          fontWeight: hindi ? undefined : bold ? "700" : "400",
          fontSize: size,
          lineHeight: Math.ceil(size * (hindi ? 1.5 : 1.3)),
          color,
          textAlign: "center",
        },
        style,
      ]}
    />
  );
}

// A small lotus in antique gold, drawn in a 24 × 14 box.
function Lotus({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G
      transform={`translate(${x - 12 * scale} ${y - 9 * scale}) scale(${scale})`}
      fill="none"
      stroke={shrine.gold}
      strokeWidth={1.1}
    >
      <Path d="M12 13 C 8 9, 8.5 4.5, 12 1.5 C 15.5 4.5, 16 9, 12 13 Z" />
      <Path d="M12 13 C 7 12.5, 3.5 9.5, 3.5 6 C 7.5 6.5, 10.5 9, 12 13 Z" />
      <Path d="M12 13 C 17 12.5, 20.5 9.5, 20.5 6 C 16.5 6.5, 13.5 9, 12 13 Z" />
      <Path d="M3 14 Q 12 16.5 21 14" />
    </G>
  );
}

// Gold lines with a lotus between them, as under the headings.
export function LotusDivider({
  width = 260,
  assetKey,
}: {
  width?: number;
  assetKey?: string;
}) {
  const height = 22;
  const mid = width / 2;
  // Narrow (inside the mala): the lotus alone.
  const lines = width >= 120;
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ width, height, alignSelf: "center" }}
    >
      <SlotImage
        assetKey={assetKey}
        style={{ width, height }}
        fallback={
          <Svg width={width} height={height}>
            {lines && (
              <G>
                <Line
                  x1={4}
                  y1={11}
                  x2={mid - 30}
                  y2={11}
                  stroke={shrine.gold}
                  strokeWidth={1}
                />
                <Line
                  x1={mid + 30}
                  y1={11}
                  x2={width - 4}
                  y2={11}
                  stroke={shrine.gold}
                  strokeWidth={1}
                />
                {[mid - 30, mid + 30].map((x) => (
                  <Path
                    key={x}
                    d={`M${x} 11 l -4 -3 l -4 3 l 4 3 Z`}
                    fill={shrine.gold}
                    transform={x > mid ? `rotate(180 ${x} 11)` : undefined}
                  />
                ))}
                <Circle cx={mid - 44} cy={11} r={1.6} fill={shrine.gold} />
                <Circle cx={mid + 44} cy={11} r={1.6} fill={shrine.gold} />
              </G>
            )}
            <Lotus x={mid} y={11} />
          </Svg>
        }
      />
    </View>
  );
}

// Plain lines either side of a short row (malas today, reset links).
export function FlankLines({
  children,
  width = 70,
}: React.PropsWithChildren<{ width?: number }>) {
  return (
    <View style={styles.flank}>
      <View style={[styles.flankLine, { width }]} />
      {children}
      <View style={[styles.flankLine, { width }]} />
    </View>
  );
}

// Bandhanwar of marigold and jasmine strands with mango leaves, hanging from
// a garland along the top of the screen. Memoised: drawn once, not again on
// every tap of the page below.
export const MarigoldToran = memo(function MarigoldToran({
  height = 72,
  assetKey,
}: {
  height?: number;
  assetKey?: string;
}) {
  const { width } = useWindowDimensions();
  const strands = Math.max(8, Math.round(width / 40));
  const gap = width / strands;
  const strandList = Array.from({ length: strands }, (_, i) => {
    const long = i % 2 === 0;
    return { x: gap / 2 + i * gap, long, blooms: long ? 2 : 1 };
  });
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, width, height }}
    >
      <SlotImage
        assetKey={assetKey}
        resizeMode="cover"
        style={{ width, height }}
        fallback={
          <Svg width={width} height={height}>
            {/* The garland along the top */}
            <MarigoldBlooms
              blooms={Array.from(
                { length: Math.ceil(width / 11) + 1 },
                (_, i) => ({ cx: i * 11, cy: 7 + (i % 2) * 2, r: 7 }),
              )}
            />
            {strandList.map(({ x, blooms }) => (
              <Line
                key={x}
                x1={x}
                y1={10}
                x2={x}
                y2={14 + blooms * 13}
                stroke="#7A5A2A"
                strokeWidth={0.8}
              />
            ))}
            <MarigoldBlooms
              blooms={strandList.flatMap(({ x, blooms }) =>
                Array.from({ length: blooms }, (_, b) => ({
                  cx: x,
                  cy: 20 + b * 13,
                  r: b === blooms - 1 ? 7.5 : 6.5,
                })),
              )}
            />
            {strandList.map(({ x, blooms, long }) => (
              <G key={x}>
                {/* Jasmine buds between the marigolds */}
                <Ellipse
                  cx={x}
                  cy={26 + (blooms - 1) * 13}
                  rx={2.4}
                  ry={3.4}
                  fill="#FFFDF5"
                  stroke="#E6DCC4"
                  strokeWidth={0.5}
                />
                <Circle
                  cx={x}
                  cy={31 + (blooms - 1) * 13}
                  r={1.6}
                  fill="#C0281F"
                />
                <MangoLeaf
                  x={x}
                  y={33 + (blooms - 1) * 13}
                  length={long ? 18 : 15}
                />
              </G>
            ))}
          </Svg>
        }
      />
    </View>
  );
});

// The parchment ground: a faint temple arch with pillars and lotus sprays,
// or the admin's background image (D-057).
export function ParchmentGround({ assetKey }: { assetKey?: string }) {
  const { width, height } = useWindowDimensions();
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <SlotImage
        assetKey={assetKey}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        fallback={<ArchDecor width={width} height={height} />}
      />
    </View>
  );
}

function ArchDecor({ width, height }: { width: number; height: number }) {
  const id = React.useId().replace(/:/g, "");
  const top = 70;
  const inset = 14;
  const archTop = top + 10;
  const shoulder = top + 120;
  const ink = shrine.gold;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={shrine.ivory} />
          <Stop offset="0.5" stopColor={shrine.parchment} />
          <Stop offset="1" stopColor={shrine.parchmentDeep} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 0 H${width} V${height} H0 Z`} fill={`url(#${id}p)`} />
      <G opacity={0.32} fill="none" stroke={ink} strokeWidth={1}>
        {/* Cusped arch over the page */}
        <Path
          d={`M${inset} ${height} V${shoulder} C ${inset} ${shoulder - 40}, ${width * 0.2} ${archTop + 30}, ${width * 0.36} ${archTop + 18} Q ${width / 2} ${archTop - 18} ${width * 0.64} ${archTop + 18} C ${width * 0.8} ${archTop + 30}, ${width - inset} ${shoulder - 40}, ${width - inset} ${shoulder} V${height}`}
        />
        <Path
          d={`M${inset + 8} ${height} V${shoulder + 6} C ${inset + 8} ${shoulder - 30}, ${width * 0.22} ${archTop + 40}, ${width * 0.37} ${archTop + 28} Q ${width / 2} ${archTop - 4} ${width * 0.63} ${archTop + 28} C ${width * 0.78} ${archTop + 40}, ${width - inset - 8} ${shoulder - 30}, ${width - inset - 8} ${shoulder + 6} V${height}`}
        />
        {/* Pillar bands */}
        {Array.from(
          { length: Math.floor((height - shoulder) / 90) },
          (_, i) => {
            const y = shoulder + 40 + i * 90;
            return (
              <G key={i}>
                <Line x1={inset} y1={y} x2={inset + 8} y2={y} />
                <Line x1={width - inset - 8} y1={y} x2={width - inset} y2={y} />
              </G>
            );
          },
        )}
      </G>
      {/* Lotus sprays in the lower corners */}
      <G opacity={0.35}>
        <Lotus x={34} y={height - 60} scale={2.2} />
        <Lotus x={width - 34} y={height - 60} scale={2.2} />
        <Lotus x={58} y={height - 120} scale={1.4} />
        <Lotus x={width - 58} y={height - 120} scale={1.4} />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  flank: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  flankLine: { height: 1, backgroundColor: shrine.gold, opacity: 0.7 },
});
