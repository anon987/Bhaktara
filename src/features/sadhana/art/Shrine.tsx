import React from "react";
import { View } from "react-native";
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
import { sanctum, shrine } from "../../../theme/tokens";
import { SlotImage } from "../shrine/Ornaments";

// A small marble mandir with the chosen deity in a green sanctum and an
// altar in front (D-057). The puja scene draws its offerings over the altar
// (D-054). Geometry is in a 300 × 360 viewBox and scaled to `size` (the
// width). When the admin has uploaded the temple painted with the deity
// (`imageKey`), that image fills the same box instead.
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
  imageKey,
  glow,
  children,
}: React.PropsWithChildren<{
  size: number;
  artKey: string;
  imageKey?: string;
  glow: boolean;
}>) {
  const s = size / SHRINE_VIEW.width;
  const height = SHRINE_VIEW.height * s;
  return (
    <View
      accessible={false}
      style={{ width: size, height, alignSelf: "center" }}
    >
      {glow && <Halo size={size} />}
      <SlotImage
        assetKey={imageKey}
        style={{ position: "absolute", width: size, height }}
        fallback={<DrawnShrine size={size} artKey={artKey} glow={glow} />}
      />
      {children}
    </View>
  );
}

function DrawnShrine({
  size,
  artKey,
  glow,
}: {
  size: number;
  artKey: string;
  glow: boolean;
}) {
  const id = React.useId().replace(/:/g, "");
  const s = size / SHRINE_VIEW.width;
  const height = SHRINE_VIEW.height * s;
  const marble = `url(#${id}mb)`;
  const gold = `url(#${id}gd)`;
  const archTop = SANCTUM.y - 8;
  const left = SANCTUM.x - 5;
  const right = SANCTUM.x + SANCTUM.width + 5;
  // A cusped (scalloped) arch over the sanctum.
  const arch = `M${left} 302 L${left} 176 C ${left} 150, ${left + 14} 136, ${left + 30} 132 Q ${left + 38} 122, ${left + 50} ${archTop + 6} Q 150 ${archTop - 12} ${right - 50} ${archTop + 6} Q ${right - 38} 122, ${right - 30} 132 C ${right - 14} 136, ${right} 150, ${right} 176 L${right} 302 Z`;
  return (
    <>
      <Svg
        width={size}
        height={height}
        viewBox={`0 0 ${SHRINE_VIEW.width} ${SHRINE_VIEW.height}`}
        style={{ position: "absolute" }}
      >
        <Defs>
          <LinearGradient id={`${id}mb`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBEFD7" />
            <Stop offset="1" stopColor={shrine.marbleShade} />
          </LinearGradient>
          <LinearGradient id={`${id}pl`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={shrine.marbleShade} />
            <Stop offset="0.45" stopColor="#FBF0DA" />
            <Stop offset="1" stopColor={shrine.marbleShade} />
          </LinearGradient>
          <LinearGradient id={`${id}gd`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={shrine.goldLight} />
            <Stop offset="1" stopColor={shrine.goldDeep} />
          </LinearGradient>
          <RadialGradient id={`${id}in`} cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#4C7E68" />
            <Stop offset="1" stopColor={shrine.sanctumGreenDeep} />
          </RadialGradient>
        </Defs>
        {/* Side chhatris */}
        {[64, 236].map((x) => (
          <G key={x}>
            <Path
              d={`M${x - 22} 106 C ${x - 22} 84, ${x - 10} 74, ${x} 70 C ${x + 10} 74, ${x + 22} 84, ${x + 22} 106 Z`}
              fill={marble}
              stroke={shrine.marbleShade}
              strokeWidth={0.8}
            />
            <Path
              d={`M${x - 16} 96 Q ${x} 90 ${x + 16} 96`}
              stroke={shrine.gold}
              strokeWidth={0.8}
              fill="none"
            />
            <Circle cx={x} cy={67} r={3} fill={gold} />
          </G>
        ))}
        {/* Central dome with bands and a kalash finial */}
        <Path
          d="M78 110 C 80 66, 116 38, 150 30 C 184 38, 220 66, 222 110 Z"
          fill={marble}
          stroke={shrine.marbleShade}
          strokeWidth={1}
        />
        {[54, 72, 90].map((y) => {
          const half = 26 + (y - 46) * 1.15;
          return (
            <Path
              key={y}
              d={`M${150 - half} ${y + 8} Q 150 ${y - 2} ${150 + half} ${y + 8}`}
              stroke={shrine.gold}
              strokeWidth={1}
              fill="none"
              opacity={0.8}
            />
          );
        })}
        {[-30, 0, 30].map((dx) => (
          <Path
            key={dx}
            d={`M${150 + dx} 100 q -6 -8 0 -16 q 6 8 0 16 Z`}
            fill="none"
            stroke={shrine.gold}
            strokeWidth={0.9}
          />
        ))}
        <Path d="M146 30 Q 150 18 154 30 Z" fill={gold} />
        <Ellipse cx={150} cy={17} rx={6} ry={5} fill={gold} />
        <Line
          x1={150}
          y1={12}
          x2={150}
          y2={4}
          stroke={shrine.goldDeep}
          strokeWidth={1.6}
        />
        <Circle cx={150} cy={4} r={2.4} fill={gold} />
        {/* Cornice with dentils */}
        <Rect x={40} y={106} width={220} height={14} rx={3} fill={marble} />
        <Rect x={36} y={104} width={228} height={4} rx={2} fill={gold} />
        {Array.from({ length: 22 }, (_, i) => (
          <Rect
            key={i}
            x={44 + i * 10}
            y={112}
            width={5}
            height={5}
            fill={shrine.marbleShade}
          />
        ))}
        {/* Temple body behind the pillars */}
        <Rect x={48} y={120} width={204} height={182} fill="#F4E4C6" />
        {/* Pillars */}
        {[52, 74, 204, 226].map((x) => (
          <G key={x}>
            <Rect
              x={x}
              y={126}
              width={22}
              height={172}
              fill={`url(#${id}pl)`}
              stroke={shrine.marbleShade}
              strokeWidth={0.6}
            />
            <Rect x={x - 3} y={120} width={28} height={8} rx={2} fill={gold} />
            <Rect x={x - 3} y={292} width={28} height={8} rx={2} fill={gold} />
            {[170, 230].map((y) => (
              <Rect
                key={y}
                x={x}
                y={y}
                width={22}
                height={3}
                fill={shrine.gold}
                opacity={0.7}
              />
            ))}
          </G>
        ))}
        {/* The sanctum: carved gold arch round a green niche */}
        <Path d={arch} fill={gold} />
        <Path
          d={arch}
          transform="translate(150 212) scale(0.94 0.955) translate(-150 -212)"
          fill={`url(#${id}in)`}
        />
        <Circle
          cx={deityCentre.x}
          cy={SANCTUM.y + 52}
          r={36}
          fill="none"
          stroke={shrine.goldLight}
          strokeWidth={1}
          opacity={0.6}
        />
        <Circle
          cx={deityCentre.x}
          cy={SANCTUM.y + 52}
          r={44}
          fill="none"
          stroke={shrine.goldLight}
          strokeWidth={0.6}
          opacity={0.35}
        />
        {/* Bells on chains */}
        {[28, 272].map((x) => (
          <G key={x}>
            {Array.from({ length: 6 }, (_, i) => (
              <Ellipse
                key={i}
                cx={x}
                cy={126 + i * 7}
                rx={1.6}
                ry={3}
                fill="none"
                stroke={shrine.goldDeep}
                strokeWidth={1}
              />
            ))}
            <Path
              d={`M${x - 11} 186 C ${x - 10} 172, ${x - 7} 166, ${x} 166 C ${x + 7} 166, ${x + 10} 172, ${x + 11} 186 Z`}
              fill={gold}
            />
            <Rect
              x={x - 13}
              y={185}
              width={26}
              height={3}
              rx={1.5}
              fill={shrine.goldDeep}
            />
            <Circle cx={x} cy={191} r={2.6} fill={shrine.goldDeep} />
          </G>
        ))}
        {/* Lamps on stands beside the sanctum */}
        {[106, 194].map((x) => (
          <G key={x}>
            <Line
              x1={x}
              y1={256}
              x2={x}
              y2={296}
              stroke={shrine.goldDeep}
              strokeWidth={1.4}
            />
            <Path d={`M${x - 7} 256 Q ${x} 262 ${x + 7} 256 Z`} fill={gold} />
            <Path
              d={`M${x} 244 C ${x - 3} 249, ${x - 2} 254, ${x} 255 C ${x + 2} 254, ${x + 3} 249, ${x} 244 Z`}
              fill={sanctum.flame}
            />
            <Circle cx={x} cy={250} r={7} fill={sanctum.ghee} opacity={0.35} />
          </G>
        ))}
        {/* Tulsi pots at the ends of the altar */}
        {[40, 260].map((x) => (
          <G key={x}>
            {[-8, -3, 3, 8].map((dx, i) => (
              <Ellipse
                key={dx}
                cx={x + dx}
                cy={278 - (i % 2) * 6}
                rx={4}
                ry={7}
                fill={i % 2 ? sanctum.leaf : sanctum.leafDark}
                transform={`rotate(${dx * 3} ${x + dx} ${284})`}
              />
            ))}
            <Path
              d={`M${x - 11} 286 Q ${x - 12} 300 ${x} 302 Q ${x + 12} 300 ${x + 11} 286 Z`}
              fill={gold}
            />
          </G>
        ))}
        {/* Altar and carved platform */}
        <Rect x={22} y={300} width={256} height={20} rx={3} fill={marble} />
        <Rect x={22} y={300} width={256} height={3} fill={gold} />
        <Rect
          x={88}
          y={304}
          width={124}
          height={14}
          rx={2}
          fill="none"
          stroke={shrine.gold}
          strokeWidth={0.8}
        />
        {Array.from({ length: 9 }, (_, i) => (
          <Circle
            key={i}
            cx={100 + i * 12.5}
            cy={311}
            r={2.2}
            fill="none"
            stroke={shrine.gold}
            strokeWidth={0.7}
          />
        ))}
        <Rect x={10} y={320} width={280} height={18} rx={3} fill={marble} />
        <Rect x={10} y={320} width={280} height={2} fill={shrine.marbleShade} />
        <Rect
          x={2}
          y={338}
          width={296}
          height={16}
          rx={3}
          fill={shrine.marble}
        />
        <Rect x={2} y={352} width={296} height={2} fill={shrine.marbleShade} />
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
    </>
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
