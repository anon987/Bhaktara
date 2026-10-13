import React from "react";
import Svg, { Circle, Rect } from "react-native-svg";

// A camera outline in the Instagram style, for the "Insta / FB status" button.
// Drawn locally so no icon package is needed. Meant for white on magenta.
export function SocialGlyph({
  size = 32,
  color = "#FFFFFF",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Rect
        x={2.5}
        y={2.5}
        width={19}
        height={19}
        rx={5.5}
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      <Circle
        cx={12}
        cy={12}
        r={4.4}
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      <Circle cx={17.4} cy={6.6} r={1.3} fill={color} />
    </Svg>
  );
}
