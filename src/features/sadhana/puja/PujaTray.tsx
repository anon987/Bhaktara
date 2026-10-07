import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "../../../components/useReducedMotion";
import { Language } from "../../../i18n/strings";
import {
  BhogKind,
  bhogNames,
  FlowerKind,
  flowerNames,
  GarlandKind,
  garlandNames,
  TrayItem,
  trayItems,
  trayNames,
} from "../../../domain/puja";
import { sanctum } from "../../../theme/tokens";
import { Bhog, Flower, Garland } from "./OfferingArt";
import { TrayIcon } from "./TrayIcons";

export type Drawer =
  | { item: "pushp"; flowers: FlowerKind[]; garland: GarlandKind }
  | { item: "naivedya"; bhog: BhogKind[] };

// The puja tray (D-054): every item is an animated icon, no text. The next
// item in the traditional order glows; any item can be used at any time.
export function PujaTray({
  language,
  done,
  next,
  lit,
  tapKeys,
  drawer,
  onItem,
  onFlower,
  onGarland,
  onBhog,
}: {
  language: Language;
  done: ReadonlySet<TrayItem>;
  next: TrayItem | null;
  lit: ReadonlySet<TrayItem>;
  tapKeys: Partial<Record<TrayItem, number>>;
  drawer: Drawer | null;
  onItem: (item: TrayItem) => void;
  onFlower: (kind: FlowerKind) => void;
  onGarland: (kind: GarlandKind) => void;
  onBhog: (kind: BhogKind) => void;
}) {
  return (
    <View style={styles.wrap}>
      {drawer && (
        <View style={styles.drawer} accessibilityRole="menu">
          {drawer.item === "pushp" ? (
            <>
              {drawer.flowers.map((kind) => (
                <Choice
                  key={kind}
                  label={flowerNames[kind][language]}
                  onPress={() => onFlower(kind)}
                >
                  <Flower kind={kind} size={44} />
                </Choice>
              ))}
              <Choice
                label={garlandNames[drawer.garland][language]}
                onPress={() => onGarland(drawer.garland)}
              >
                <Garland kind={drawer.garland} width={52} height={40} />
              </Choice>
            </>
          ) : (
            drawer.bhog.map((kind) => (
              <Choice
                key={kind}
                label={bhogNames[kind][language]}
                onPress={() => onBhog(kind)}
              >
                <Bhog kind={kind} size={46} />
              </Choice>
            ))
          )}
        </View>
      )}
      <LinearGradient
        colors={[sanctum.brassLight, sanctum.brass, sanctum.brassDeep]}
        style={styles.tray}
      >
        {[trayItems.slice(0, 4), trayItems.slice(4)].map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((item) => (
              <TrayButton
                key={item}
                item={item}
                label={trayNames[item][language]}
                done={done.has(item)}
                glowing={next === item}
                lit={lit.has(item)}
                selected={drawer?.item === item}
                tapKey={tapKeys[item] ?? 0}
                onPress={() => onItem(item)}
              />
            ))}
          </View>
        ))}
      </LinearGradient>
    </View>
  );
}

function TrayButton({
  item,
  label,
  done,
  glowing,
  lit,
  selected,
  tapKey,
  onPress,
}: {
  item: TrayItem;
  label: string;
  done: boolean;
  glowing: boolean;
  lit: boolean;
  selected: boolean;
  tapKey: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  const tap = useSharedValue(0);
  useEffect(() => {
    if (!glowing || reduced) {
      pulse.value = withTiming(0, { duration: 200 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [glowing, reduced, pulse]);
  useEffect(() => {
    if (tapKey === 0) return;
    tap.value = 0;
    tap.value = withTiming(1, { duration: item === "ghanti" ? 900 : 600 });
  }, [tapKey, item, tap]);

  const ring = useAnimatedStyle(() => ({
    opacity: glowing ? 0.35 + pulse.value * 0.65 : 0,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));
  // Each item answers a tap in its own way: the bell swings, the kalash
  // tips to pour, the shankh lifts, the others bow slightly.
  const icon = useAnimatedStyle(() => {
    const t = tap.value;
    const wave = Math.sin(t * Math.PI * 6) * (1 - t);
    if (item === "ghanti")
      return { transform: [{ rotate: `${wave * 28}deg` }] };
    if (item === "kalash")
      return { transform: [{ rotate: `${Math.sin(t * Math.PI) * -38}deg` }] };
    if (item === "shankh")
      return {
        transform: [
          { translateY: -Math.sin(t * Math.PI) * 14 },
          { rotate: `${Math.sin(t * Math.PI) * -20}deg` },
        ],
      };
    return { transform: [{ scale: 1 + Math.sin(t * Math.PI) * 0.18 }] };
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: done }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cup,
        selected && styles.cupSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.glow, ring]} />
      <Animated.View style={icon}>
        <TrayIcon item={item} size={50} lit={lit} />
      </Animated.View>
      {done && <View style={styles.doneDot} />}
    </Pressable>
  );
}

function Choice({
  label,
  onPress,
  children,
}: React.PropsWithChildren<{ label: string; onPress: () => void }>) {
  const t = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.sin(t.value * Math.PI) * 0.2 }],
  }));
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      onPress={() => {
        t.value = 0;
        t.value = withSequence(withTiming(1, { duration: 360 }));
        onPress();
      }}
      style={styles.choice}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  drawer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    padding: 8,
    borderRadius: 24,
    backgroundColor: "rgba(63, 26, 20, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(243, 213, 138, 0.4)",
  },
  choice: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243, 213, 138, 0.12)",
  },
  tray: {
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: sanctum.brassLight,
  },
  row: { flexDirection: "row", justifyContent: "space-around" },
  cup: {
    width: 72,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(110, 42, 28, 0.55)",
  },
  cupSelected: { backgroundColor: "rgba(110, 42, 28, 0.9)" },
  glow: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: sanctum.ghee,
  },
  doneDot: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: sanctum.ghee,
  },
});
