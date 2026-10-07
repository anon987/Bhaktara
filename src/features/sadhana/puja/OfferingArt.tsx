import React from "react";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import {
  BhogKind,
  FlowerKind,
  GarlandKind,
  TilakStyle,
} from "../../../domain/puja";
import { sanctum } from "../../../theme/tokens";
import { MarigoldShape } from "../art/Marigold";
import { SlotImage } from "../shrine/Ornaments";

// Offerings drawn in a 40 × 40 box; decorative (callers label them).

const petals = (
  cx: number,
  cy: number,
  count: number,
  length: number,
  width: number,
  fill: string,
  rotate = 0,
) =>
  Array.from({ length: count }, (_, i) => (
    <Ellipse
      key={i}
      cx={cx}
      cy={cy - length / 2}
      rx={width}
      ry={length / 2}
      fill={fill}
      rotation={rotate + (i * 360) / count}
      origin={`${cx}, ${cy}`}
    />
  ));

export function FlowerShape({ kind }: { kind: FlowerKind }) {
  switch (kind) {
    case "bilva":
      // Three-leaved bel patra.
      return (
        <G>
          {[-38, 0, 38].map((angle) => (
            <Path
              key={angle}
              d="M20 22 C 12 16, 13 6, 20 3 C 27 6, 28 16, 20 22 Z"
              fill="#3F7A2E"
              stroke="#2A5A1E"
              strokeWidth={0.8}
              rotation={angle}
              origin="20, 24"
            />
          ))}
          <Line
            x1={20}
            y1={24}
            x2={20}
            y2={36}
            stroke="#2A5A1E"
            strokeWidth={2}
          />
        </G>
      );
    case "dhatura":
      // White trumpet with a violet throat.
      return (
        <G>
          <Path
            d="M8 10 L 32 10 L 24 32 L 16 32 Z"
            fill="#F4F1EA"
            stroke="#D6CFC2"
            strokeWidth={0.8}
          />
          <Path
            d="M8 10 Q 20 2 32 10"
            fill="#FFFFFF"
            stroke="#D6CFC2"
            strokeWidth={0.8}
          />
          <Ellipse cx={20} cy={11} rx={5} ry={2.5} fill="#B79BD1" />
          <Path d="M16 32 L 24 32 L 22 38 L 18 38 Z" fill="#5E8C3A" />
        </G>
      );
    case "aak":
      // Small waxy lavender-white crown flower.
      return (
        <G>
          {petals(20, 20, 5, 16, 5, "#E9E2F2", 0)}
          <Circle cx={20} cy={20} r={5} fill="#B8A3D6" />
          <Circle cx={20} cy={20} r={2} fill="#FFFFFF" />
        </G>
      );
    case "kaner":
      // Oleander: pink, five twisted petals.
      return (
        <G>
          {petals(20, 20, 5, 17, 6, "#F49AC1", 12)}
          <Circle cx={20} cy={20} r={3.5} fill="#FFE7F1" />
        </G>
      );
    case "durva":
      // A tuft of three-bladed durva grass.
      return (
        <G>
          {[-28, -14, 0, 14, 28].map((angle, i) => (
            <Path
              key={angle}
              d={`M20 36 Q ${20 + angle / 3} 20 ${20 + angle / 1.6} ${4 + (i % 2) * 4}`}
              stroke={i % 2 ? "#4E8A2E" : "#6BA83D"}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          <Rect
            x={16}
            y={34}
            width={8}
            height={3}
            rx={1.5}
            fill={sanctum.kumkum}
          />
        </G>
      );
    case "hibiscus":
      // Red gudhal with a long stamen.
      return (
        <G>
          {petals(20, 21, 5, 18, 8, "#D0182A", 0)}
          <Circle cx={20} cy={21} r={4} fill="#8E0E1A" />
          <Line
            x1={20}
            y1={21}
            x2={30}
            y2={6}
            stroke="#F2C230"
            strokeWidth={1.6}
          />
          <Circle cx={30} cy={6} r={2} fill="#F2C230" />
        </G>
      );
    case "genda":
      return <MarigoldShape cx={20} cy={20} r={17} />;
    case "tulsi":
      // A sprig of tulsi leaves with manjari.
      return (
        <G>
          <Line
            x1={20}
            y1={38}
            x2={20}
            y2={6}
            stroke="#4A6B2A"
            strokeWidth={1.6}
          />
          {[10, 18, 26].map((y, i) => (
            <G key={y}>
              <Ellipse
                cx={14}
                cy={y}
                rx={6}
                ry={3.5}
                fill="#4E8A3A"
                rotation={-25 + i * 4}
                origin={`14, ${y}`}
              />
              <Ellipse
                cx={26}
                cy={y}
                rx={6}
                ry={3.5}
                fill="#5E9A45"
                rotation={25 - i * 4}
                origin={`26, ${y}`}
              />
            </G>
          ))}
          <Ellipse cx={20} cy={5} rx={2.5} ry={5} fill="#7A4E8C" />
        </G>
      );
    case "lotus":
      return (
        <G>
          {[-60, -30, 0, 30, 60].map((angle) => (
            <Ellipse
              key={angle}
              cx={20}
              cy={16}
              rx={5.5}
              ry={13}
              fill={Math.abs(angle) > 40 ? "#F3A6C0" : "#F7C1D3"}
              stroke="#E07FA3"
              strokeWidth={0.8}
              rotation={angle}
              origin="20, 30"
            />
          ))}
          <Ellipse cx={20} cy={32} rx={14} ry={3} fill="#5E9A45" />
        </G>
      );
    case "jasmine":
      // Small white chameli flowers in a cluster.
      return (
        <G>
          {[
            [13, 15],
            [27, 15],
            [20, 27],
          ].map(([x, y]) => (
            <G key={`${x}`}>
              {petals(x, y, 5, 10, 3.2, "#FFFDF6", 0)}
              <Circle cx={x} cy={y} r={2} fill="#F2D57A" />
            </G>
          ))}
        </G>
      );
    case "champa":
      // Frangipani: cream petals with a yellow heart.
      return (
        <G>
          {petals(20, 20, 5, 18, 6.5, "#FFF6DF", 18)}
          <Circle cx={20} cy={20} r={6} fill="#F6C343" />
        </G>
      );
    case "rose":
      return (
        <G>
          <Circle cx={20} cy={20} r={15} fill="#C2183A" />
          <Path
            d="M20 8 C 30 10, 32 26, 20 30 C 10 28, 9 14, 20 8 Z"
            fill="#E0284F"
          />
          <Path
            d="M20 14 C 26 15, 26 24, 20 25 C 15 24, 14 17, 20 14 Z"
            fill="#9E0F2C"
          />
          <Path
            d="M17 19 q 3 -3 6 0"
            stroke="#F06A86"
            strokeWidth={1.2}
            fill="none"
          />
        </G>
      );
  }
}

// `imageKey`: the admin's image for this offering (D-057), drawn instead.
export function Flower({
  kind,
  size,
  imageKey,
}: {
  kind: FlowerKind;
  size: number;
  imageKey?: string;
}) {
  return (
    <SlotImage
      assetKey={imageKey}
      style={{ width: size, height: size }}
      fallback={
        <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
          <FlowerShape kind={kind} />
        </Svg>
      }
    />
  );
}

export function BhogShape({ kind }: { kind: BhogKind }) {
  const bowl = (fill: string, top: string) => (
    <G>
      <Path d="M4 20 Q 20 40 36 20 Z" fill={sanctum.brass} />
      <Ellipse cx={20} cy={20} rx={16} ry={4.5} fill={top} />
      <Ellipse
        cx={20}
        cy={20}
        rx={16}
        ry={4.5}
        fill="none"
        stroke={sanctum.brassDeep}
        strokeWidth={1}
      />
      <Path d="M8 22 Q 20 30 32 22" fill={fill} opacity={0.4} />
    </G>
  );
  switch (kind) {
    case "modak":
      // Steamed modak: pleated teardrop dumplings.
      return (
        <G>
          {[
            [12, 0.9],
            [28, 0.9],
            [20, 1.05],
          ].map(([x, s], i) => (
            <G key={i}>
              <Path
                d={`M${x} ${8 + (1 - s) * 30} C ${x + 9 * s} ${20}, ${x + 9 * s} ${34}, ${x} ${34} C ${x - 9 * s} ${34}, ${x - 9 * s} ${20}, ${x} ${8 + (1 - s) * 30} Z`}
                fill="#F6EAD2"
                stroke="#D9C39A"
                strokeWidth={0.8}
              />
              <Path
                d={`M${x} ${12} L ${x} 33 M${x - 4} 18 L ${x - 5} 32 M${x + 4} 18 L ${x + 5} 32`}
                stroke="#E2CFA6"
                strokeWidth={0.8}
              />
            </G>
          ))}
        </G>
      );
    case "laddoo":
      return (
        <G>
          {[
            [12, 28],
            [28, 28],
            [20, 16],
          ].map(([x, y]) => (
            <G key={`${x}${y}`}>
              <Circle
                cx={x}
                cy={y}
                r={9}
                fill="#F2A93B"
                stroke="#D9861E"
                strokeWidth={0.8}
              />
              {[0, 1, 2, 3].map((d) => (
                <Circle
                  key={d}
                  cx={x - 4 + d * 2.6}
                  cy={y - 2 + (d % 2) * 3}
                  r={1}
                  fill="#E08A1E"
                />
              ))}
            </G>
          ))}
        </G>
      );
    case "makhanMishri":
      // A clay handi of white butter topped with mishri crystals.
      return (
        <G>
          <Path d="M8 18 C 6 32, 34 32, 32 18 Z" fill={sanctum.clay} />
          <Ellipse cx={20} cy={18} rx={12} ry={3.5} fill={sanctum.clayDark} />
          <Path d="M10 18 C 12 8, 28 8, 30 18 Z" fill="#FFFBEF" />
          <Rect
            x={16}
            y={9}
            width={4}
            height={4}
            fill="#E6F2FA"
            rotation={20}
            origin="18, 11"
          />
          <Rect
            x={22}
            y={11}
            width={3.5}
            height={3.5}
            fill="#E6F2FA"
            rotation={-15}
            origin="23, 12"
          />
        </G>
      );
    case "peda":
      return (
        <G>
          {[
            [12, 26],
            [28, 26],
            [20, 15],
          ].map(([x, y]) => (
            <G key={`${x}${y}`}>
              <Ellipse
                cx={x}
                cy={y}
                rx={9}
                ry={6}
                fill="#E8C68E"
                stroke="#C9A066"
                strokeWidth={0.8}
              />
              <Circle cx={x} cy={y - 1} r={1.6} fill="#7FA34A" />
            </G>
          ))}
        </G>
      );
    case "kheer":
      return (
        <G>
          {bowl("#FFF4DE", "#FFF4DE")}
          <Circle cx={16} cy={19} r={1.4} fill="#7FA34A" />
          <Circle cx={23} cy={20} r={1.4} fill="#C98A3E" />
        </G>
      );
    case "doodh":
      // A brass lota of milk.
      return (
        <G>
          <Path
            d="M10 22 C 6 36, 34 36, 30 22 C 28 16, 12 16, 10 22 Z"
            fill={sanctum.brass}
          />
          <Rect
            x={14}
            y={8}
            width={12}
            height={8}
            rx={2}
            fill={sanctum.brassDeep}
          />
          <Ellipse cx={20} cy={8} rx={8} ry={2.5} fill="#FFFFFF" />
          <Path
            d="M12 28 Q 20 32 28 28"
            stroke={sanctum.brassLight}
            strokeWidth={1.4}
            fill="none"
          />
        </G>
      );
    case "panchamrit":
      return (
        <G>
          {bowl("#F7E7C1", "#F7E7C1")}
          <Ellipse cx={22} cy={19} rx={4} ry={1.4} fill="#E6B54A" />
          <Ellipse
            cx={20}
            cy={14}
            rx={3}
            ry={5}
            fill="#5E9A45"
            rotation={30}
            origin="20, 14"
          />
        </G>
      );
    case "gudChana":
      return (
        <G>
          <Ellipse cx={20} cy={28} rx={16} ry={6} fill={sanctum.brass} />
          {[
            [12, 24],
            [17, 22],
            [22, 25],
            [27, 23],
            [14, 28],
            [25, 28],
          ].map(([x, y]) => (
            <Circle key={`${x}${y}`} cx={x} cy={y} r={2.6} fill="#C48A3A" />
          ))}
          <Rect x={16} y={12} width={10} height={8} rx={2} fill="#8B4E1E" />
        </G>
      );
    case "halwa":
      return (
        <G>
          {bowl("#E39A3C", "#E39A3C")}
          <Path d="M10 20 C 14 12, 26 12, 30 20 Z" fill="#E8A146" />
          <Circle cx={18} cy={15} r={1.4} fill="#FFFFFF" />
          <Circle cx={23} cy={16} r={1.4} fill="#7FA34A" />
        </G>
      );
    case "coconut":
      return (
        <G>
          <Ellipse cx={20} cy={22} rx={13} ry={14} fill="#8B5A2B" />
          <Path
            d="M10 16 Q 20 10 30 16"
            stroke="#6B4220"
            strokeWidth={1.5}
            fill="none"
          />
          <Path d="M20 8 L 20 2" stroke="#6B4220" strokeWidth={2} />
          <Path
            d="M10 30 Q 20 36 30 30"
            stroke={sanctum.kumkum}
            strokeWidth={2}
            fill="none"
          />
        </G>
      );
    case "banana":
      return (
        <G>
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M6 ${14 + i * 5} C 14 ${34 + i * 2}, 30 ${32 + i * 2}, 36 ${12 + i * 5}`}
              stroke={i === 1 ? "#F2D23B" : "#E8C42E"}
              strokeWidth={6}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          <Rect x={4} y={10} width={5} height={6} rx={1} fill="#6B8E23" />
        </G>
      );
    case "mishri":
      return (
        <G>
          <Ellipse cx={20} cy={28} rx={16} ry={6} fill={sanctum.brass} />
          {[
            [12, 22],
            [20, 20],
            [27, 23],
            [16, 15],
            [24, 14],
          ].map(([x, y], i) => (
            <Rect
              key={i}
              x={x - 3.5}
              y={y - 3.5}
              width={7}
              height={7}
              fill="#EEF6FB"
              stroke="#C7D9E6"
              strokeWidth={0.8}
              rotation={i * 23}
              origin={`${x}, ${y}`}
            />
          ))}
        </G>
      );
  }
}

export function Bhog({
  kind,
  size,
  imageKey,
}: {
  kind: BhogKind;
  size: number;
  imageKey?: string;
}) {
  return (
    <SlotImage
      assetKey={imageKey}
      style={{ width: size, height: size }}
      fallback={
        <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
          <BhogShape kind={kind} />
        </Svg>
      }
    />
  );
}

// A garland hanging as a U over the sanctum arch; width × height in px.
export function Garland({
  kind,
  width,
  height,
  imageKey,
}: {
  kind: GarlandKind;
  width: number;
  height: number;
  imageKey?: string;
}) {
  return (
    <SlotImage
      assetKey={imageKey}
      style={{ width, height }}
      fallback={<DrawnGarland kind={kind} width={width} height={height} />}
    />
  );
}

function DrawnGarland({
  kind,
  width,
  height,
}: {
  kind: GarlandKind;
  width: number;
  height: number;
}) {
  const count = 15;
  const beads = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    // A catenary-like U: deepest in the middle.
    return {
      x: 8 + t * (width - 16),
      y: 8 + Math.sin(t * Math.PI) * (height - 18),
    };
  });
  const r = Math.min(width / count, 14) * 0.62;
  return (
    <Svg width={width} height={height} accessible={false}>
      <Path
        d={`M${beads[0].x} ${beads[0].y} ${beads.map((b) => `L ${b.x} ${b.y}`).join(" ")}`}
        stroke={sanctum.kumkum}
        strokeWidth={1.5}
        fill="none"
      />
      {beads.map((b, i) => {
        if (kind === "genda")
          return <MarigoldShape key={i} cx={b.x} cy={b.y} r={r} />;
        if (kind === "rudraksha")
          return (
            <Circle
              key={i}
              cx={b.x}
              cy={b.y}
              r={r * 0.7}
              fill="#7A3E1C"
              stroke="#4D2414"
              strokeWidth={1}
            />
          );
        const fill =
          kind === "rose" ? (i % 2 ? "#C2183A" : "#E0284F") : "#FFFDF6";
        return (
          <G key={i}>
            <Circle cx={b.x} cy={b.y} r={r * 0.85} fill={fill} />
            {kind === "jasmine" && (
              <Circle cx={b.x} cy={b.y} r={r * 0.3} fill="#F2D57A" />
            )}
          </G>
        );
      })}
      {/* A tassel of leaves at the bottom */}
      <Path
        d={`M${width / 2} ${height - 10} l -5 9 l 5 -3 l 5 3 Z`}
        fill={sanctum.leaf}
      />
    </Svg>
  );
}

// The tilak, drawn at the deity's forehead; size is the width in px.
export function Tilak({ style, size }: { style: TilakStyle; size: number }) {
  return (
    <Svg
      width={size}
      height={size * 0.8}
      viewBox="0 0 40 32"
      accessible={false}
    >
      {style === "tripundra" && (
        <G>
          {[8, 14, 20].map((y) => (
            <Rect
              key={y}
              x={4}
              y={y}
              width={32}
              height={3.2}
              rx={1.6}
              fill="#F1ECE2"
            />
          ))}
          <Circle cx={20} cy={15.5} r={3.2} fill={sanctum.kumkum} />
        </G>
      )}
      {style === "urdhvaPundra" && (
        <G>
          <Path
            d="M10 2 L 16 26 L 24 26 L 30 2"
            stroke="#F1E2C6"
            strokeWidth={3.6}
            fill="none"
            strokeLinecap="round"
          />
          <Rect
            x={18.4}
            y={6}
            width={3.2}
            height={20}
            rx={1.6}
            fill={sanctum.kumkum}
          />
        </G>
      )}
      {style === "bindu" && (
        <G>
          <Ellipse cx={20} cy={16} rx={4} ry={8} fill={sanctum.kumkum} />
          <Circle cx={20} cy={27} r={2.2} fill="#F2C230" />
        </G>
      )}
    </Svg>
  );
}
