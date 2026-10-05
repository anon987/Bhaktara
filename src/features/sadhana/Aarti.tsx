import React, { useEffect, useRef, useState } from "react";
import { GestureResponderEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { sanctum } from "../../theme/tokens";
import { Diya } from "./art/Diya";
import { deityCentre, SHRINE_VIEW } from "./art/Shrine";

const TAU = Math.PI * 2;
const ORBIT = 104; // viewBox units around the deity

// The aarti thali, circled round the deity with a finger (D-053). Each full
// round, in either direction, counts; back-and-forth wiggles cancel out.
// `auto` circles it by itself for those who cannot drag.
export function AartiCircle({
  size,
  rounds = 3,
  auto,
  onRound,
}: {
  size: number;
  rounds?: number;
  auto: boolean;
  onRound: (round: number) => void;
}) {
  const s = size / SHRINE_VIEW.width;
  const cx = deityCentre.x * s;
  const cy = deityCentre.y * s;
  const radius = ORBIT * s;
  const [angle, setAngle] = useState(Math.PI / 2);
  const [dragging, setDragging] = useState(false);
  const [counted, setCounted] = useState(0);
  // Gesture state lives in refs, read only by handlers and effects.
  const turn = useRef({ last: 0, total: 0, counted: 0 });
  const centre = useRef({ cx, cy });
  const report = useRef(onRound);
  useEffect(() => {
    report.current = onRound;
    centre.current = { cx, cy };
  }, [onRound, cx, cy]);

  const advance = useRef((next: number) => {
    const state = turn.current;
    let delta = next - state.last;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    state.last = next;
    state.total += delta;
    const done = Math.floor(Math.abs(state.total) / TAU);
    if (done > state.counted && state.counted < rounds) {
      state.counted = done;
      setCounted(done);
      report.current(done);
    }
    setAngle(next);
  });

  // Plain responder props: the handlers touch refs only during a gesture.
  const angleAt = (x: number, y: number) =>
    Math.atan2(y - centre.current.cy, x - centre.current.cx);
  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      turn.current.last = angleAt(locationX, locationY);
      setDragging(true);
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      advance.current(angleAt(locationX, locationY));
    },
    onResponderRelease: () => setDragging(false),
    onResponderTerminate: () => setDragging(false),
  };

  useEffect(() => {
    if (!auto) return;
    // About two seconds a round, clockwise.
    const handle = setInterval(() => {
      if (turn.current.counted >= rounds) return clearInterval(handle);
      advance.current(turn.current.last + TAU / 60);
    }, 33);
    return () => clearInterval(handle);
  }, [auto, rounds]);

  const plate = 58 * s;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;
  return (
    <View style={StyleSheet.absoluteFill} {...touch} accessible={false}>
      {!dragging && counted === 0 && !auto && (
        <Svg
          width={size}
          height={size * (SHRINE_VIEW.height / SHRINE_VIEW.width)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={sanctum.brassLight}
            strokeWidth={2}
            strokeDasharray="6 8"
            fill="none"
            opacity={0.8}
          />
          {/* Arrowhead showing the clockwise direction, at the top */}
          <Path
            d={`M${cx - 10} ${cy - radius - 8} L ${cx + 4} ${cy - radius} L ${cx - 10} ${cy - radius + 8}`}
            stroke={sanctum.brassLight}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      )}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - plate / 2,
          top: y - plate / 2,
          width: plate,
          height: plate,
          borderRadius: plate / 2,
          backgroundColor: sanctum.brass,
          borderWidth: 2,
          borderColor: sanctum.brassLight,
          alignItems: "center",
          justifyContent: "flex-end",
          overflow: "visible",
        }}
      >
        <Diya size={plate * 0.8} glow={1} />
      </View>
    </View>
  );
}
