import React from "react";
import Svg, { Circle, G, Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";

// Marigold (genda) bloom drawn at (cx, cy) inside a parent <Svg>.
export function MarigoldShape({
  cx,
  cy,
  r,
  faded = false,
}: {
  cx: number;
  cy: number;
  r: number;
  faded?: boolean;
}) {
  const outer = faded ? "#8C6A4A" : sanctum.marigoldDeep;
  const inner = faded ? "#A88762" : sanctum.marigold;
  const petals = 10;
  return (
    <G opacity={faded ? 0.45 : 1}>
      {Array.from({ length: petals }, (_, i) => {
        const angle = (i / petals) * Math.PI * 2;
        return (
          <Circle
            key={`o${i}`}
            cx={cx + Math.cos(angle) * r * 0.62}
            cy={cy + Math.sin(angle) * r * 0.62}
            r={r * 0.42}
            fill={outer}
          />
        );
      })}
      {Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2 + 0.3;
        return (
          <Circle
            key={`i${i}`}
            cx={cx + Math.cos(angle) * r * 0.3}
            cy={cy + Math.sin(angle) * r * 0.3}
            r={r * 0.36}
            fill={inner}
          />
        );
      })}
      <Circle
        cx={cx}
        cy={cy}
        r={r * 0.2}
        fill={faded ? "#6E5238" : "#B5470B"}
      />
    </G>
  );
}

// Mango leaf hanging from (x, y), pointing down.
export function MangoLeaf({
  x,
  y,
  length,
  tilt = 0,
}: {
  x: number;
  y: number;
  length: number;
  tilt?: number;
}) {
  const w = length * 0.32;
  return (
    <G rotation={tilt} origin={`${x}, ${y}`}>
      <Path
        d={`M${x} ${y} C ${x + w} ${y + length * 0.3}, ${x + w * 0.7} ${y + length * 0.75}, ${x} ${y + length} C ${x - w * 0.7} ${y + length * 0.75}, ${x - w} ${y + length * 0.3}, ${x} ${y} Z`}
        fill={sanctum.leaf}
      />
      <Path
        d={`M${x} ${y + 2} L ${x} ${y + length - 3}`}
        stroke={sanctum.leafDark}
        strokeWidth={1}
      />
    </G>
  );
}

export function Marigold({
  size = 28,
  faded = false,
}: {
  size?: number;
  faded?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      <MarigoldShape cx={20} cy={20} r={17} faded={faded} />
    </Svg>
  );
}
