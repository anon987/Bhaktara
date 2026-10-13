import React from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { sanctum, shrine } from "../../../theme/tokens";

// The symbol above the mantra on the Jaap screen (D-057), drawn in a
// 160 × 64 box: Krishna's flute with a peacock feather, Shiva's trishul and
// damru, Hanuman's gada, and a lotus for every other deity. The admin can
// upload an image per deity instead (deity.jaapEmblem).
export function DeityEmblem({
  deityId,
  height,
}: {
  deityId: string | null;
  height: number;
}) {
  const id = React.useId().replace(/:/g, "");
  const width = (height * 160) / 64;
  const gold = `url(#${id}g)`;
  return (
    <Svg width={width} height={height} viewBox="0 0 160 64" accessible={false}>
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={shrine.goldLight} />
          <Stop offset="1" stopColor={shrine.goldDeep} />
        </LinearGradient>
        <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E9B865" />
          <Stop offset="1" stopColor="#A86E2A" />
        </LinearGradient>
      </Defs>
      {deityId === "krishna" || deityId === "vishnu" || deityId === "ram" ? (
        deityId === "krishna" ? (
          <Flute gold={gold} bamboo={`url(#${id}f)`} />
        ) : (
          <Lotus />
        )
      ) : deityId === "shiva" ? (
        <Trishul gold={gold} />
      ) : deityId === "hanuman" ? (
        <Gada gold={gold} />
      ) : (
        <Lotus />
      )}
    </Svg>
  );
}

function Flute({ gold, bamboo }: { gold: string; bamboo: string }) {
  return (
    <G>
      {/* Peacock feather */}
      <G transform="rotate(-28 40 34)">
        {Array.from({ length: 14 }, (_, i) => {
          const y = 16 + i * 2.6;
          return (
            <Line
              key={i}
              x1={40}
              y1={y}
              x2={i % 2 ? 24 : 56}
              y2={y - 6}
              stroke={sanctum.leaf}
              strokeWidth={1.1}
              opacity={0.85}
            />
          );
        })}
        <Line
          x1={40}
          y1={10}
          x2={40}
          y2={58}
          stroke="#6E5A2A"
          strokeWidth={1.2}
        />
        <Ellipse cx={40} cy={22} rx={12} ry={14} fill="#2F7F5F" />
        <Ellipse cx={40} cy={23} rx={8} ry={9.5} fill="#C9A227" />
        <Ellipse cx={40} cy={24} rx={5.4} ry={6.4} fill="#2C6FB0" />
        <Ellipse cx={40} cy={25} rx={2.6} ry={3.2} fill="#1A2E5A" />
      </G>
      {/* Bamboo flute with gold bands and tassels */}
      <G transform="rotate(-8 90 38)">
        <Rect x={30} y={34} width={124} height={8} rx={4} fill={bamboo} />
        <Rect
          x={30}
          y={34}
          width={124}
          height={2.4}
          rx={1.2}
          fill="#FFF1C8"
          opacity={0.5}
        />
        {[44, 126, 146].map((x) => (
          <Rect key={x} x={x} y={33} width={4} height={10} rx={1} fill={gold} />
        ))}
        {[70, 80, 90, 100, 110].map((x) => (
          <Ellipse key={x} cx={x} cy={38} rx={1.8} ry={1.4} fill="#5E3A16" />
        ))}
        {[132, 138].map((x) => (
          <G key={x}>
            <Line
              x1={x}
              y1={42}
              x2={x}
              y2={54}
              stroke={shrine.gold}
              strokeWidth={1}
            />
            <Ellipse cx={x} cy={56} rx={2.4} ry={3.2} fill={gold} />
          </G>
        ))}
      </G>
    </G>
  );
}

function Trishul({ gold }: { gold: string }) {
  return (
    <G>
      <Rect x={78} y={14} width={4} height={48} rx={2} fill={gold} />
      <Path
        d="M80 2 L 84 14 L 76 14 Z M64 8 C 64 22, 70 26, 80 26 C 90 26, 96 22, 96 8 C 92 18, 86 20, 80 20 C 74 20, 68 18, 64 8 Z"
        fill={gold}
      />
      {/* Damru tied below the prongs */}
      <G transform="translate(88 30)">
        <Path
          d="M0 0 L 16 0 L 9 7 L 16 14 L 0 14 L 7 7 Z"
          fill={sanctum.kumkum}
        />
        <Line
          x1={8}
          y1={0}
          x2={8}
          y2={-4}
          stroke={shrine.goldDeep}
          strokeWidth={1}
        />
      </G>
      <Path
        d="M70 38 Q 80 42 90 38"
        stroke={shrine.saffron}
        strokeWidth={2}
        fill="none"
      />
    </G>
  );
}

function Gada({ gold }: { gold: string }) {
  return (
    <G transform="rotate(-30 80 32)">
      <Rect x={40} y={30} width={60} height={5} rx={2.5} fill={gold} />
      <Circle cx={40} cy={32.5} r={4} fill={gold} />
      <Ellipse cx={110} cy={32.5} rx={16} ry={14} fill={gold} />
      {[100, 110, 120].map((x) => (
        <Line
          key={x}
          x1={x}
          y1={21}
          x2={x}
          y2={44}
          stroke={shrine.goldDeep}
          strokeWidth={0.8}
          opacity={0.7}
        />
      ))}
      <Path d="M126 32.5 L 132 32.5" stroke={shrine.goldDeep} strokeWidth={3} />
    </G>
  );
}

function Lotus() {
  const petal = (angle: number, fill: string, scale = 1) => (
    <Path
      key={`${angle}${fill}`}
      d="M80 56 C 70 44, 71 26, 80 14 C 89 26, 90 44, 80 56 Z"
      fill={fill}
      transform={`rotate(${angle} 80 56) scale(${scale})`}
      stroke={shrine.saffronDeep}
      strokeWidth={0.6}
    />
  );
  return (
    <G>
      {petal(-60, "#F6B8A8")}
      {petal(60, "#F6B8A8")}
      {petal(-30, "#F49A8A")}
      {petal(30, "#F49A8A")}
      {petal(0, "#EE7F72")}
      <Path
        d="M56 58 Q 80 62 104 58"
        stroke={sanctum.leaf}
        strokeWidth={2}
        fill="none"
      />
    </G>
  );
}
