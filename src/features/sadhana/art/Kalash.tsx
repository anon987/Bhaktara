import React from "react";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { MangoLeaf } from "./Marigold";

// The purna kalash of a sankalp: a brass pot with mango leaves and a
// coconut. Decorative: callers give the meaning in text.
export function Kalash({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      {[140, 180, 220].map((tilt) => (
        <MangoLeaf key={tilt} x={20} y={15} length={11} tilt={tilt} />
      ))}
      <Ellipse cx={20} cy={10.5} rx={5} ry={5.5} fill="#8A5A2B" />
      <Path d="M18 6 L20 3 L22 6 Z" fill={sanctum.leaf} />
      <Rect x={15} y={15} width={10} height={5} fill={sanctum.brassDeep} />
      <Ellipse cx={20} cy={15.5} rx={8} ry={2.2} fill={sanctum.brass} />
      <Path
        d="M10 23 C 8 31, 13 37.5, 20 37.5 C 27 37.5, 32 31, 30 23 C 28 19.5, 12 19.5, 10 23 Z"
        fill={sanctum.brass}
        stroke={sanctum.brassDeep}
        strokeWidth={1}
      />
      <Path
        d="M11 26.5 Q 20 30 29 26.5"
        stroke={sanctum.kumkum}
        strokeWidth={2.2}
        fill="none"
      />
      <Circle cx={20} cy={32} r={1.8} fill={sanctum.kumkum} />
      <Path
        d="M14 22.5 C 13 25, 13 28, 14.5 31"
        stroke={sanctum.brassLight}
        strokeWidth={1.4}
        fill="none"
        opacity={0.8}
      />
    </Svg>
  );
}

// A small rudraksha mala with its tassel, for the malas total.
export function MalaBeads({ size = 32 }: { size?: number }) {
  const beads = 14;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      {Array.from({ length: beads }, (_, i) => {
        // Leave a gap at the bottom for the guru bead and tassel.
        const angle = Math.PI / 2 + ((i + 1) / (beads + 1)) * Math.PI * 2;
        const x = 20 + Math.cos(angle) * 12.5;
        const y = 17 + Math.sin(angle) * 12.5;
        return (
          <React.Fragment key={i}>
            <Circle cx={x} cy={y} r={2.7} fill="#8A4B2A" />
            <Circle
              cx={x - 0.8}
              cy={y - 0.8}
              r={0.9}
              fill="#FFFFFF"
              opacity={0.45}
            />
          </React.Fragment>
        );
      })}
      <Circle cx={20} cy={30} r={3.2} fill={sanctum.brass} />
      <Path d="M17.5 32 L22.5 32 L24 39 L16 39 Z" fill={sanctum.kumkum} />
    </Svg>
  );
}
