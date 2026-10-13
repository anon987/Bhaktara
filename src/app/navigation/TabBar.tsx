import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ImageSourcePropType,
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
import { ToranDrop } from "./TabIcons";
import { useReducedMotion } from "../../components/useReducedMotion";

export { useReducedMotion };

const useNativeDriver = Platform.OS !== "web";
// Strong ease-out: the change starts immediately under the finger.
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const PILL = { width: 60, height: 42 };
const DROP = 11;

// 3D tab art (made with Gemini on Vertex).
const tabArt: Record<keyof TabParams, ImageSourcePropType> = {
  Home: require("../../../assets/tabs/home.webp"),
  Explore: require("../../../assets/tabs/explore.webp"),
  Mandir: require("../../../assets/tabs/mandir.webp"),
  Sadhana: require("../../../assets/tabs/sadhana.webp"),
  Profile: require("../../../assets/tabs/profile.webp"),
};
const ICON = 34;
const HALO = 52;

// The chosen icon springs up and grows into a saffron glow; each also settles
// with a gesture that suits it. Reduced motion keeps only the brightening.
function activeMotion(name: keyof TabParams, progress: Animated.Value) {
  const range = (output: number[] | string[]) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: output });
  const lift = [{ translateY: range([3, -6]) }, { scale: range([0.86, 1.18]) }];
  switch (name) {
    case "Explore": // the compass swings to north
      return [...lift, { rotate: range(["-90deg", "0deg"]) }];
    case "Sadhana": // the mala turns, bead by bead
      return [...lift, { rotate: range(["-60deg", "0deg"]) }];
    default:
      return lift;
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
    // Springs in with a little overshoot (the bounce); eases out quietly.
    (active && !reduced
      ? Animated.spring(progress, {
          toValue: 1,
          useNativeDriver,
          stiffness: 240,
          damping: 11,
          mass: 1,
        })
      : Animated.timing(progress, {
          toValue: active ? 1 : 0,
          duration: reduced ? 120 : 220,
          easing: easeOut,
          useNativeDriver,
        })
    ).start();
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
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.45],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <PetalBloom bloom={bloom} />
        <Animated.Image
          source={tabArt[name]}
          accessible={false}
          style={[
            styles.icon,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.62, 1],
                extrapolate: "clamp",
              }),
              transform: reduced ? [] : activeMotion(name, progress),
            },
          ]}
        />
      </Animated.View>
      <Txt
        size={12}
        bold={active}
        numberOfLines={1}
        style={{ color: active ? colors.marigold : colors.headerText }}
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
            <ToranDrop color={colors.haldi} size={DROP - 1} />
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
  // Temple maroon edged in gold.
  bar: {
    flexDirection: "row",
    backgroundColor: colors.maroon,
    borderTopWidth: 2,
    borderColor: colors.gold,
  },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
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
  icon: { width: ICON, height: ICON },
  halo: {
    position: "absolute",
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: colors.bhagwa,
  },
  petal: {
    position: "absolute",
    left: PILL.width / 2 - 2,
    top: PILL.height / 2 - 3.5,
    width: 4,
    height: 7,
    borderRadius: 2,
  },
});
