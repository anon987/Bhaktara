import React from "react";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { sanctum } from "../../../theme/tokens";
import { MarigoldShape } from "./Marigold";

// A still, small diya for calendars and lists: "rest" (unlit clay), "lit"
// (a qualifying day) or "full" (full Sadhana, ringed with marigolds).
export function MiniLamp({
  size = 34,
  state,
}: {
  size?: number;
  state: "rest" | "lit" | "full";
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      {state === "full" &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <MarigoldShape
              key={i}
              cx={20 + Math.cos(a) * 16}
              cy={22 + Math.sin(a) * 14}
              r={3.6}
            />
          );
        })}
      {state !== "rest" && (
        <Circle cx={20} cy={17} r={11} fill={sanctum.flame} opacity={0.22} />
      )}
      <Path
        d="M7 25 C 9 33, 31 33, 33 25 Z"
        fill={state === "rest" ? "#B99A84" : sanctum.clay}
      />
      <Ellipse
        cx={20}
        cy={25}
        rx={13}
        ry={2.6}
        fill={state === "rest" ? "#8E735F" : sanctum.clayDark}
      />
      {state !== "rest" && (
        <Path
          d="M20 9 C 24 15, 25 19, 22.5 22 C 21 23.5, 19 23.5, 17.5 22 C 15 19, 16 15, 20 9 Z"
          fill={sanctum.flame}
        />
      )}
      {state !== "rest" && (
        <Path
          d="M20 15 C 21.8 18, 22 20, 20.8 21.5 C 20.3 22, 19.7 22, 19.2 21.5 C 18 20, 18.2 18, 20 15 Z"
          fill={sanctum.flameCore}
        />
      )}
    </Svg>
  );
}
