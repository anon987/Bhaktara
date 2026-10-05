import React from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { MarigoldShape } from "./Marigold";

// Progress as a marigold garland: flowers bloom as the goal fills, the rest
// wait as faded buds. Callers give the numbers in text beside it.
export function GarlandProgress({
  value,
  flowers = 10,
  width,
  height = 34,
}: {
  value: number;
  flowers?: number;
  width?: number;
  height?: number;
}) {
  const window = useWindowDimensions();
  const w = width ?? window.width - 72;
  const bloomed = Math.round(Math.max(0, Math.min(1, value)) * flowers);
  const step = w / flowers;
  const r = Math.min(step * 0.42, height * 0.42);
  return (
    <View accessible={false} pointerEvents="none" style={{ width: w, height }}>
      <Svg width={w} height={height}>
        <Path
          d={`M0 ${height / 2} Q ${w / 2} ${height / 2 + 6} ${w} ${height / 2}`}
          stroke={sanctum.brass}
          strokeWidth={1.5}
          fill="none"
        />
        {Array.from({ length: flowers }, (_, i) => (
          <MarigoldShape
            key={i}
            cx={step * i + step / 2}
            cy={height / 2 + Math.sin(((i + 0.5) / flowers) * Math.PI) * 3}
            r={i < bloomed ? r : r * 0.7}
            faded={i >= bloomed}
          />
        ))}
      </Svg>
    </View>
  );
}
