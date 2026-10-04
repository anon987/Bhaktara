import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { TabParams } from "./routes";

// Original devotional tab glyphs on a 24-unit grid. Each has an outline form
// (inactive) and a filled form (active); the tab bar crossfades between them.
// `cutout` matches the active pill so doorways and inner marks read as openings.
export type GlyphProps = {
  filled: boolean;
  color: string;
  flame: string;
  mark: string;
  cutout: string;
  size?: number;
};
const line = {
  fill: "none",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const flamePath = (x: number, y: number, s = 1) =>
  `M${x} ${y}c${0.95 * s} ${1.05 * s} ${1.2 * s} ${1.8 * s} ${1.2 * s} ${2.35 * s}a${1.2 * s} ${1.2 * s} 0 0 1-${2.4 * s} 0c0-${0.55 * s} ${0.25 * s}-${1.3 * s} ${1.2 * s}-${2.35 * s}Z`;

function Home({ filled, color, flame, mark, cutout }: GlyphProps) {
  return filled ? (
    <>
      <Circle cx="12" cy="2.2" r="1.15" fill={mark} />
      <Path
        d="M12 3.6 21.1 11.4H18.9V21H5.1V11.4H2.9Z"
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <Path d="M9.9 21v-4.3a2.1 2.1 0 0 1 4.2 0V21Z" fill={cutout} />
      <Path d={flamePath(12, 15.9, 0.9)} fill={flame} />
    </>
  ) : (
    <>
      <Circle cx="12" cy="2.3" r="0.95" fill={color} />
      <Path d="M3.4 11.2 12 4l8.6 7.2" stroke={color} {...line} />
      <Path d="M5.8 9.7V20.2h12.4V9.7" stroke={color} {...line} />
      <Path d="M10 20.2v-3.6a2 2 0 0 1 4 0v3.6" stroke={color} {...line} />
    </>
  );
}

const star =
  "M12 6.1 13.55 10.45 17.9 12 13.55 13.55 12 17.9 10.45 13.55 6.1 12 10.45 10.45Z";
function Explore({ filled, color, mark, cutout }: GlyphProps) {
  return filled ? (
    <>
      <Circle cx="12" cy="12" r="9.7" fill={color} />
      {[0, 90, 180, 270].map((angle) => (
        <Circle
          key={angle}
          cx={12 + 7.8 * Math.sin((angle * Math.PI) / 180)}
          cy={12 - 7.8 * Math.cos((angle * Math.PI) / 180)}
          r="0.6"
          fill={cutout}
        />
      ))}
      <Path d={star} fill={cutout} />
      <Circle cx="12" cy="12" r="1.35" fill={mark} />
    </>
  ) : (
    <>
      <Circle cx="12" cy="12" r="9" stroke={color} {...line} />
      <Path d={star} stroke={color} {...line} strokeWidth={1.5} />
    </>
  );
}

function Mandir({ filled, color, flame, mark, cutout }: GlyphProps) {
  return filled ? (
    <>
      <Path
        d="M12 2v3.6"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <Path d="M12 2.1 15.7 3.35 12 4.6Z" fill={mark} />
      <Path
        d="M6.9 11.1c0-3.3 2.2-5.5 5.1-6.25 2.9.75 5.1 2.95 5.1 6.25Z"
        fill={color}
      />
      <Rect x="3.9" y="10.3" width="16.2" height="1.9" rx="0.6" fill={color} />
      <Rect x="5.9" y="11.8" width="12.2" height="8" fill={color} />
      <Rect x="3.1" y="19.2" width="17.8" height="1.8" rx="0.9" fill={color} />
      <Path d="M10.25 19.3v-3a1.75 1.75 0 0 1 3.5 0v3Z" fill={cutout} />
      <Path d={flamePath(12, 15.6, 0.75)} fill={flame} />
    </>
  ) : (
    <>
      <Path
        d="M12 5.2V2.2l3.2 1.1L12 4.4"
        stroke={color}
        {...line}
        strokeWidth={1.4}
      />
      <Path
        d="M7.4 10.8c0-3 2-5 4.6-5.6 2.6.6 4.6 2.6 4.6 5.6"
        stroke={color}
        {...line}
      />
      <Path d="M4.4 10.8h15.2" stroke={color} {...line} />
      <Path d="M6.2 10.8V20h11.6v-9.2" stroke={color} {...line} />
      <Path d="M10.3 20v-3.3a1.7 1.7 0 0 1 3.4 0V20" stroke={color} {...line} />
      <Path d="M3.4 20h17.2" stroke={color} {...line} />
    </>
  );
}

// Eleven beads around a 60° gap that holds the guru bead and tassel.
const beads = Array.from({ length: 11 }, (_, index) => {
  const angle = ((210 + index * 30) * Math.PI) / 180;
  return { x: 12 + 6.6 * Math.sin(angle), y: 10.2 - 6.6 * Math.cos(angle) };
});
function Sadhana({ filled, color, flame, mark }: GlyphProps) {
  return (
    <>
      {beads.map(({ x, y }, index) =>
        filled ? (
          <Circle key={index} cx={x} cy={y} r="1.5" fill={color} />
        ) : (
          <Circle
            key={index}
            cx={x}
            cy={y}
            r="1.2"
            stroke={color}
            strokeWidth={1.4}
            fill="none"
          />
        ),
      )}
      {filled ? (
        <>
          <Circle cx="12" cy="17.5" r="1.7" fill={mark} />
          <Path d="M12 19 10.6 22.3h2.8Z" fill={mark} />
          <Path d={flamePath(12, 7.7, 1.15)} fill={flame} />
        </>
      ) : (
        <>
          <Circle
            cx="12"
            cy="17.5"
            r="1.45"
            stroke={color}
            strokeWidth={1.4}
            fill="none"
          />
          <Path
            d="M12 19.1 10.9 22h2.2Z"
            stroke={color}
            {...line}
            strokeWidth={1.3}
          />
        </>
      )}
    </>
  );
}

// A small U-shaped tilak on the forehead.
const tilak = "M10.9 5.9v1.1a1.1 1.1 0 0 0 2.2 0V5.9";
function Profile({ filled, color, mark }: GlyphProps) {
  return filled ? (
    <>
      <Path
        d="M7.3 3.6a6.4 6.4 0 0 1 9.4 0"
        stroke={mark}
        {...line}
        strokeWidth={1.4}
      />
      <Circle cx="12" cy="8.3" r="3.9" fill={color} />
      <Path
        d="M4.5 20.5c.5-4 3.5-6.6 7.5-6.6s7 2.6 7.5 6.6a.8.8 0 0 1-.8.9H5.3a.8.8 0 0 1-.8-.9Z"
        fill={color}
      />
      <Path d={tilak} stroke={mark} {...line} strokeWidth={1.2} />
    </>
  ) : (
    <>
      <Circle cx="12" cy="8.2" r="3.6" stroke={color} {...line} />
      <Path
        d="M4.8 20.4c.6-3.9 3.5-6.2 7.2-6.2s6.6 2.3 7.2 6.2"
        stroke={color}
        {...line}
      />
      <Path d={tilak} stroke={color} {...line} strokeWidth={1.1} />
    </>
  );
}

const glyphs: Record<keyof TabParams, (props: GlyphProps) => React.ReactNode> =
  {
    Home,
    Explore,
    Mandir,
    Sadhana,
    Profile,
  };
export function TabGlyph({
  name,
  size = 26,
  ...props
}: GlyphProps & { name: keyof TabParams }) {
  const Glyph = glyphs[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Glyph {...props} />
    </Svg>
  );
}

// The hanging marigold drop that travels with the active pill, like a toran bead.
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
