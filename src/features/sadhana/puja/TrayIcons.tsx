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
import { TrayItem } from "../../../domain/puja";
import { sanctum } from "../../../theme/tokens";
import { MarigoldShape } from "../art/Marigold";

// The puja tray's items, drawn in a 64 × 64 box. Decorative: the tray
// button around each icon carries its name for screen readers.
export function TrayIcon({
  item,
  size,
  lit = false,
}: {
  item: TrayItem;
  size: number;
  lit?: boolean;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sanctum.brassLight} />
          <Stop offset="1" stopColor={sanctum.brassDeep} />
        </LinearGradient>
        <LinearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E08A4A" />
          <Stop offset="1" stopColor="#9A4A1E" />
        </LinearGradient>
      </Defs>
      {item === "kalash" && (
        <G>
          {/* Copper kalash with mango leaves and a coconut */}
          <Path
            d="M22 26 C 10 34, 12 54, 32 56 C 52 54, 54 34, 42 26 Z"
            fill={`url(#${id}c)`}
          />
          <Rect x={24} y={22} width={16} height={6} rx={2} fill="#B5622C" />
          <Path
            d="M20 38 Q 32 44 44 38"
            stroke={sanctum.kumkum}
            strokeWidth={2}
            fill="none"
          />
          {[-14, -6, 6, 14].map((dx) => (
            <Path
              key={dx}
              d={`M32 22 Q ${32 + dx} ${14} ${32 + dx * 1.5} ${18}`}
              stroke={sanctum.leaf}
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          <Ellipse cx={32} cy={13} rx={7} ry={8} fill="#8B5A2B" />
        </G>
      )}
      {item === "ghanti" && (
        <G>
          {/* Hand bell with a Garuda-style knob */}
          <Rect
            x={29}
            y={6}
            width={6}
            height={14}
            rx={2}
            fill={`url(#${id}b)`}
          />
          <Circle cx={32} cy={6} r={4} fill={sanctum.brass} />
          <Path
            d="M16 48 C 16 30, 22 20, 32 20 C 42 20, 48 30, 48 48 Z"
            fill={`url(#${id}b)`}
          />
          <Rect
            x={13}
            y={46}
            width={38}
            height={5}
            rx={2.5}
            fill={sanctum.brassDeep}
          />
          <Circle cx={32} cy={55} r={4} fill={sanctum.brassDeep} />
        </G>
      )}
      {item === "chandan" && (
        <G>
          {/* A small bowl of sandal paste with a dot of roli */}
          <Ellipse cx={32} cy={46} rx={22} ry={9} fill={`url(#${id}b)`} />
          <Path d="M10 40 Q 32 62 54 40 Z" fill={sanctum.brassDeep} />
          <Ellipse cx={32} cy={40} rx={20} ry={6} fill="#F1D9A7" />
          <Circle cx={38} cy={39} r={4} fill={sanctum.kumkum} />
          <Path
            d="M24 38 q 3 -3 6 0"
            stroke="#D9B271"
            strokeWidth={1.5}
            fill="none"
          />
        </G>
      )}
      {item === "pushp" && (
        <G>
          {/* A leaf dona heaped with flowers */}
          <Path d="M8 38 Q 32 62 56 38 Z" fill={sanctum.leaf} />
          <Path
            d="M8 38 Q 32 52 56 38"
            stroke={sanctum.leafDark}
            strokeWidth={1.5}
            fill="none"
          />
          <MarigoldShape cx={22} cy={34} r={9} />
          <MarigoldShape cx={42} cy={34} r={9} />
          <MarigoldShape cx={32} cy={26} r={10} />
          <Circle cx={27} cy={38} r={5} fill="#E8475B" />
        </G>
      )}
      {item === "dhoop" && (
        <G>
          {/* Incense sticks in a brass holder */}
          <Ellipse cx={32} cy={54} rx={16} ry={5} fill={`url(#${id}b)`} />
          <Rect
            x={26}
            y={44}
            width={12}
            height={10}
            rx={3}
            fill={sanctum.brassDeep}
          />
          {[-6, 0, 6].map((dx) => (
            <Line
              key={dx}
              x1={32 + dx * 0.3}
              y1={46}
              x2={32 + dx}
              y2={14}
              stroke="#5B3A22"
              strokeWidth={2.4}
            />
          ))}
          {[-6, 0, 6].map((dx) => (
            <Circle
              key={`t${dx}`}
              cx={32 + dx}
              cy={13}
              r={2.4}
              fill={lit ? sanctum.flame : "#7A5236"}
            />
          ))}
          {lit && (
            <Path
              d="M32 11 c -5 -4, 5 -6, 0 -10"
              stroke="#EDE3D6"
              strokeWidth={1.5}
              fill="none"
            />
          )}
        </G>
      )}
      {item === "naivedya" && (
        <G>
          {/* A thali of laddoos */}
          <Ellipse cx={32} cy={46} rx={26} ry={9} fill={`url(#${id}b)`} />
          <Ellipse cx={32} cy={44} rx={22} ry={6} fill={sanctum.brassLight} />
          {[
            [24, 40],
            [32, 40],
            [40, 40],
            [28, 33],
            [36, 33],
            [32, 26],
          ].map(([x, y]) => (
            <Circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={5.5}
              fill="#F2A93B"
              stroke="#D9861E"
              strokeWidth={0.8}
            />
          ))}
        </G>
      )}
      {item === "deep" && (
        <G>
          {/* A clay diya on a small stand */}
          <Path d="M10 40 C 14 52, 50 52, 54 40 Z" fill={sanctum.clay} />
          <Ellipse cx={32} cy={40} rx={22} ry={5} fill={sanctum.clayDark} />
          <Ellipse cx={32} cy={40} rx={18} ry={3.5} fill="#E7B862" />
          <Path d="M24 50 L 40 50 L 38 58 L 26 58 Z" fill={sanctum.clayDark} />
          {lit ? (
            <G>
              <Ellipse
                cx={32}
                cy={26}
                rx={10}
                ry={14}
                fill={sanctum.flame}
                opacity={0.25}
              />
              <Path
                d="M32 14 C 38 24, 39 32, 32 38 C 25 32, 26 24, 32 14 Z"
                fill={sanctum.flame}
              />
              <Path
                d="M32 24 C 35 29, 35 33, 32 36 C 29 33, 29 29, 32 24 Z"
                fill={sanctum.flameCore}
              />
            </G>
          ) : (
            <Line
              x1={32}
              y1={39}
              x2={33}
              y2={32}
              stroke="#3A2416"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          )}
        </G>
      )}
      {item === "shankh" && (
        <G>
          {/* A conch, spiral to the left */}
          <Path
            d="M10 34 C 10 20, 26 12, 40 16 C 52 20, 58 30, 54 40 C 50 50, 34 54, 22 50 C 16 48, 10 42, 10 34 Z"
            fill="#F7EFE2"
            stroke="#C9B79C"
            strokeWidth={1.5}
          />
          <Path
            d="M20 36 C 22 26, 36 22, 44 28 C 50 33, 46 42, 38 42 C 32 42, 30 36, 34 34"
            stroke="#D8C6AA"
            strokeWidth={2}
            fill="none"
          />
          <Path d="M54 40 L 62 46 L 52 46 Z" fill="#E9DCC6" />
          <Path d="M10 34 L 4 30 L 6 38 Z" fill="#E9DCC6" />
          <Circle cx={40} cy={30} r={2.5} fill="#E7A9A0" />
        </G>
      )}
    </Svg>
  );
}
