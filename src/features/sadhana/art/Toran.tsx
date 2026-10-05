import React from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { MangoLeaf, MarigoldShape } from "./Marigold";

// Bandhanwar: the auspicious door garland of mango leaves and marigolds that
// frames every practice screen like the entrance to a mandir.
export function Toran({ height = 64 }: { height?: number }) {
  const { width } = useWindowDimensions();
  const swags = Math.max(3, Math.round(width / 120));
  const span = width / swags;
  const sag = height * 0.28;
  const thread = Array.from({ length: swags }, (_, i) => {
    const x0 = i * span;
    return `${i === 0 ? `M${x0} 6` : ""} Q ${x0 + span / 2} ${6 + sag} ${x0 + span} 6`;
  }).join(" ");
  // Points along each swag where leaves and flowers hang.
  const hangers: { x: number; y: number; leaf: boolean; tilt: number }[] = [];
  for (let i = 0; i < swags; i += 1) {
    for (let j = 1; j <= 5; j += 1) {
      const t = j / 6;
      const x = i * span + t * span;
      // Point on the quadratic swag at t.
      const y = 6 + 2 * t * (1 - t) * sag;
      hangers.push({ x, y, leaf: j % 2 === 1, tilt: (t - 0.5) * 16 });
    }
  }
  return (
    <View accessible={false} pointerEvents="none" style={{ height, width }}>
      <Svg width={width} height={height}>
        <Path d={`M0 3 L ${width} 3`} stroke={sanctum.kumkum} strokeWidth={3} />
        {hangers
          .filter((h) => h.leaf)
          .map((h, i) => (
            <MangoLeaf
              key={`l${i}`}
              x={h.x}
              y={h.y}
              length={height * 0.62}
              tilt={h.tilt}
            />
          ))}
        <Path d={thread} stroke={sanctum.brass} strokeWidth={2} fill="none" />
        {hangers
          .filter((h) => !h.leaf)
          .map((h, i) => (
            <MarigoldShape
              key={`m${i}`}
              cx={h.x}
              cy={h.y + 4}
              r={height * 0.13}
            />
          ))}
        {Array.from({ length: swags + 1 }, (_, i) => (
          <Circle
            key={`k${i}`}
            cx={i * span}
            cy={6}
            r={5}
            fill={sanctum.kumkum}
          />
        ))}
      </Svg>
    </View>
  );
}
