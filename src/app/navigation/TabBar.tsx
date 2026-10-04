import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../providers/AppProvider";
import { colors } from "../../theme/tokens";
import { Txt } from "../../components/ui";
import { MiniPlayer } from "../../features/player/MiniPlayer";
import { StringKey } from "../../i18n/strings";
import { TabParams } from "./routes";
import { TabGlyph, ToranDrop } from "./TabIcons";

const useNativeDriver = Platform.OS !== "web";
// Strong ease-out: the change starts immediately under the finger.
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const PILL = { width: 60, height: 34 };
const DROP = 11;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

// Each glyph settles with a gesture that suits it. Reduced motion keeps only
// the outline-to-filled crossfade.
function activeMotion(name: keyof TabParams, progress: Animated.Value) {
  const range = (output: number[] | string[]) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: output });
  switch (name) {
    case "Explore": // the compass needle swings to north
      return [{ rotate: range(["-90deg", "0deg"]) }];
    case "Mandir": // the temple rises into place
      return [{ translateY: range([4, 0]) }, { scale: range([0.9, 1]) }];
    case "Sadhana": // the mala turns, bead by bead
      return [{ rotate: range(["-60deg", "0deg"]) }];
    default:
      return [{ translateY: range([2, 0]) }, { scale: range([0.82, 1]) }];
  }
}

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];
function PetalBloom({ bloom }: { bloom: Animated.Value }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PETALS.map((angle, index) => (
        <Animated.View
          key={angle}
          style={[
            styles.petal,
            {
              backgroundColor: index % 2 ? colors.marigold : colors.saffron,
              opacity: bloom.interpolate({
                inputRange: [0, 0.2, 1],
                outputRange: [0, 0.75, 0],
              }),
              transform: [
                { rotate: `${angle}deg` },
                {
                  translateY: bloom.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, -21],
                  }),
                },
                {
                  scale: bloom.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function TabItem({
  name,
  label,
  active,
  reduced,
  onPress,
  onLongPress,
}: {
  name: keyof TabParams;
  label: string;
  active: boolean;
  reduced: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const [progress] = useState(() => new Animated.Value(active ? 1 : 0));
  const [bloom] = useState(() => new Animated.Value(1));
  const [press] = useState(() => new Animated.Value(1));
  const wasActive = useRef(active);
  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reduced ? 120 : 260,
      easing: easeOut,
      useNativeDriver,
    }).start();
    // Bloom only when this tab newly becomes active, never on mount.
    if (active && !wasActive.current && !reduced) {
      bloom.setValue(0);
      Animated.timing(bloom, {
        toValue: 1,
        duration: 480,
        easing: easeOut,
        useNativeDriver,
      }).start();
    }
    wasActive.current = active;
  }, [active, reduced, progress, bloom]);
  const pressTo = (toValue: number) =>
    Animated.spring(press, {
      toValue,
      useNativeDriver,
      speed: 40,
      bounciness: toValue === 1 ? 6 : 0,
    }).start();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => pressTo(0.9)}
      onPressOut={() => pressTo(1)}
      style={styles.tab}
    >
      <Animated.View
        style={[styles.iconArea, { transform: [{ scale: press }] }]}
      >
        <PetalBloom bloom={bloom} />
        <Animated.View
          style={[
            styles.glyph,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}
        >
          <TabGlyph
            name={name}
            filled={false}
            color={colors.muted}
            flame={colors.saffron}
            mark={colors.marigold}
            cutout={colors.surface}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.glyph,
            {
              opacity: progress,
              transform: reduced ? [] : activeMotion(name, progress),
            },
          ]}
        >
          <TabGlyph
            name={name}
            filled
            color={colors.primary}
            flame={colors.saffron}
            mark={colors.marigold}
            cutout={colors.pale}
          />
        </Animated.View>
      </Animated.View>
      <Txt
        size={12}
        bold={active}
        numberOfLines={1}
        style={{ color: active ? colors.primary : colors.muted }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

export function TabBar({
  state,
  navigation,
  onOpenPlayer,
}: BottomTabBarProps & { onOpenPlayer: () => void }) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [indicator] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const tabWidth = width / state.routes.length;
  useEffect(() => {
    if (!tabWidth) return;
    const toValue = state.index * tabWidth;
    // Place the pill without motion on first layout or with reduced motion.
    if (!placed.current || reduced) {
      indicator.setValue(toValue);
      placed.current = true;
      return;
    }
    // A lightly damped spring: it can be retargeted mid-flight by fast taps.
    Animated.spring(indicator, {
      toValue,
      useNativeDriver,
      stiffness: 320,
      damping: 26,
      mass: 1,
    }).start();
  }, [state.index, tabWidth, reduced, indicator]);
  return (
    <View>
      <MiniPlayer onOpen={onOpenPlayer} />
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[styles.bar, { paddingBottom: Math.max(10, insets.bottom) }]}
      >
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { width: tabWidth, transform: [{ translateX: indicator }] },
            ]}
          >
            <ToranDrop color={colors.marigold} size={DROP - 1} />
            <View style={styles.pill} />
          </Animated.View>
        )}
        {state.routes.map((route, index) => {
          const active = state.index === index;
          return (
            <TabItem
              key={route.key}
              name={route.name as keyof TabParams}
              label={t(route.name.toLowerCase() as StringKey)}
              active={active}
              reduced={reduced}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
  },
  pill: {
    width: PILL.width,
    height: PILL.height,
    borderRadius: PILL.height / 2,
    backgroundColor: colors.pale,
  },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    paddingTop: DROP,
    gap: 2,
  },
  iconArea: {
    width: PILL.width,
    height: PILL.height,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { position: "absolute" },
  petal: {
    position: "absolute",
    left: PILL.width / 2 - 2,
    top: PILL.height / 2 - 3.5,
    width: 4,
    height: 7,
    borderRadius: 2,
  },
});
