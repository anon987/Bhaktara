import React from "react";
import Svg, { Path } from "react-native-svg";

// The marigold drop that hangs over the chosen tab, like a toran bead.
export function ToranDrop({
  color,
  size = 10,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 10 11">
      <Path d="M5 0v3" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Path
        d="M5 3c2 1.9 2.8 3.4 2.8 4.6a2.8 2.8 0 0 1-5.6 0C2.2 6.4 3 4.9 5 3Z"
        fill={color}
      />
    </Svg>
  );
}
