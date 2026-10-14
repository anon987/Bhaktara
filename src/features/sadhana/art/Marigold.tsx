import React from "react";
import Svg, { G, Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { circlePath } from "./svgPaths";

export type Bloom = { cx: number; cy: number; r: number };

// Marigold (genda) blooms drawn inside a parent <Svg>. All the blooms share
// three paths (outer petals, inner petals, hearts) rather than 18 circles
// each: a toran hangs dozens of them.
export function MarigoldBlooms({
  blooms,
  faded = false,
}: {
  blooms: Bloom[];
  faded?: boolean;
}) {
  const outer = faded ? "#8C6A4A" : sanctum.marigoldDeep;
  const inner = faded ? "#A88762" : sanctum.marigold;
  const petals = 10;
  let outerPetals = "";
  let innerPetals = "";
  let hearts = "";
  for (const { cx, cy, r } of blooms) {
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2;
      outerPetals += circlePath(
        cx + Math.cos(angle) * r * 0.62,
        cy + Math.sin(angle) * r * 0.62,
        r * 0.42,
      );
    }
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.3;
      innerPetals += circlePath(
        cx + Math.cos(angle) * r * 0.3,
        cy + Math.sin(angle) * r * 0.3,
        r * 0.36,
      );
    }
    hearts += circlePath(cx, cy, r * 0.2);
  }
  return (
    <G opacity={faded ? 0.45 : 1}>
      <Path d={outerPetals} fill={outer} />
      <Path d={innerPetals} fill={inner} />
      <Path d={hearts} fill={faded ? "#6E5238" : "#B5470B"} />
    </G>
  );
}

// One marigold bloom drawn at (cx, cy).
export function MarigoldShape({
  cx,
  cy,
  r,
  faded = false,
}: Bloom & { faded?: boolean }) {
  return <MarigoldBlooms blooms={[{ cx, cy, r }]} faded={faded} />;
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
