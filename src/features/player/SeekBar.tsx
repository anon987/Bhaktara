import React, { useEffect, useMemo, useState } from "react";
import {
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { formatTime } from "../../domain/practice";
import { usePlayer } from "./PlayerProvider";
import { playerColors } from "./PlayerArt";

export const SKIP_SECONDS = 15;
const THUMB = 30;
const TOUCH_HEIGHT = 56;
// After a seek, the target is held until the player reports a position near
// it, so the thumb never jumps back for a moment.
const HOLD_MS = 1500;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// The seek bar and the elapsed / total times: the only part of the player
// that follows every position update. Drag the large thumb (or tap the
// track) to move; screen readers adjust in 15-second steps.
export function SeekBar() {
  const { t } = useApp();
  const {
    position,
    duration: reported,
    status,
    item,
    seekTo,
    seekBy,
  } = usePlayer();
  const duration = reported || item?.durationSeconds || 0;
  const enabled = status === "ready" && duration > 0;
  const [width, setWidth] = useState(0);
  // The fraction under the finger while dragging, or the target just sought.
  const [drag, setDrag] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);

  // Rebuilt only when the bar's size, the track or readiness changes (not on
  // position updates). `grab` is where the finger went down.
  const responder = useMemo(() => {
    const grab = { fraction: 0, pageX: 0 };
    const fractionAt = (event: GestureResponderEvent) => {
      if (width <= 0) return grab.fraction;
      return clamp01(
        grab.fraction + (event.nativeEvent.pageX - grab.pageX) / width,
      );
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabled,
      onMoveShouldSetPanResponder: () => enabled,
      // Keep the drag when the page tries to scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const { locationX, pageX } = event.nativeEvent;
        grab.fraction = width > 0 ? clamp01(locationX / width) : 0;
        grab.pageX = pageX;
        setDrag(grab.fraction);
      },
      onPanResponderMove: (event) => setDrag(fractionAt(event)),
      // Seek on release; a tap is a grant and a release in one place.
      onPanResponderRelease: (event) => {
        const target = fractionAt(event) * duration;
        setDrag(null);
        setHeld(target);
        seekTo(target);
      },
      onPanResponderTerminate: () => setDrag(null),
    });
  }, [width, duration, enabled, seekTo]);

  // Let go of the held target once the player has caught up (or after a
  // moment, if it never reports one close by).
  useEffect(() => {
    if (held === null) return;
    const timer = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(timer);
  }, [held]);
  const caughtUp = held !== null && Math.abs(position - held) < 2;
  const shownSeconds =
    drag !== null
      ? drag * duration
      : held !== null && !caughtUp
        ? held
        : Math.min(position, duration || position);
  const fraction = duration > 0 ? clamp01(shownSeconds / duration) : 0;
  const dragging = drag !== null;
  return (
    <View style={styles.wrap}>
      <View
        testID="player-seek"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t("playbackPosition")}
        accessibilityHint={t("dragToSeek")}
        accessibilityState={{ disabled: !enabled }}
        accessibilityValue={{
          min: 0,
          max: Math.round(duration),
          now: Math.round(shownSeconds),
          text: `${formatTime(Math.floor(shownSeconds))} / ${formatTime(Math.floor(duration))}`,
        }}
        accessibilityActions={[
          { name: "increment", label: t("seekForward") },
          { name: "decrement", label: t("seekBack") },
        ]}
        onAccessibilityAction={(event) =>
          seekBy(
            event.nativeEvent.actionName === "increment"
              ? SKIP_SECONDS
              : -SKIP_SECONDS,
          )
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[styles.touch, !enabled && { opacity: 0.55 }]}
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={styles.track}>
          <LinearGradient
            colors={[playerColors.brassDeep, playerColors.brassLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${fraction * 100}%` }]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: fraction * width - THUMB / 2 },
            dragging && styles.thumbActive,
          ]}
        >
          <View style={styles.thumbCore} />
        </View>
      </View>
      <View style={styles.times}>
        <Txt
          bold
          size={dragging ? 22 : 18}
          style={{
            color: dragging ? playerColors.brassLight : playerColors.text,
          }}
        >
          {formatTime(Math.floor(shownSeconds))}
        </Txt>
        <Txt size={18} style={{ color: playerColors.muted }}>
          {formatTime(Math.floor(duration))}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  touch: {
    height: TOUCH_HEIGHT,
    justifyContent: "center",
    marginHorizontal: THUMB / 2,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 230, 168, 0.22)",
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4 },
  thumb: {
    position: "absolute",
    top: (TOUCH_HEIGHT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: playerColors.brassLight,
    borderWidth: 3,
    borderColor: playerColors.brassDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbActive: { transform: [{ scale: 1.2 }] },
  thumbCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C0281F",
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: -4,
    minHeight: 34,
  },
});
