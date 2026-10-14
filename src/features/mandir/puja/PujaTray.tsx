import React, { useEffect } from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Lock, Play } from "lucide-react-native";
import { Txt } from "../../../components/ui";
import { useReducedMotion } from "../../../components/useReducedMotion";
import { Language } from "../../../i18n/strings";
import {
  BhogKind,
  bhogNames,
  GarlandKind,
  garlandNames,
  TrayItem,
  trayItems,
  trayLabels,
  trayNames,
} from "../../../domain/puja";
import { noVisuals, Visuals } from "../../../domain/visuals";
import { colors, shrine } from "../../../theme/tokens";
import type { MandirDecor } from "../decor/decor";
import { SlotImage } from "../../sadhana/shrine/Ornaments";
import { Bhog, Garland } from "./OfferingArt";
import { TrayIcon } from "./TrayIcons";

export type Drawer =
  | { item: "pushp"; flowers: MandirDecor[]; garland: GarlandKind }
  | { item: "naivedya"; bhog: BhogKind[] };

// The offering tray (D-054, D-057): eight labelled tiles in two rows. The
// next item in the traditional order glows; any item can be used at any
// time; offered items turn saffron with a tick. Flowers and bhog open a
// drawer of what suits the deity. Images from the admin panel replace the
// drawn icons.
export function PujaTray({
  language,
  done,
  next,
  lit,
  tapKeys,
  drawer,
  visuals = noVisuals,
  icons = {},
  locked = () => false,
  lockedLabel = "",
  onItem,
  onFlower,
  onGarland,
  onBhog,
  lights,
}: {
  language: Language;
  done: ReadonlySet<TrayItem>;
  next: TrayItem | null;
  lit: ReadonlySet<TrayItem>;
  tapKeys: Partial<Record<TrayItem, number>>;
  drawer: Drawer | null;
  visuals?: Visuals;
  // Images that replace a tile's icon (the chosen bell on the ghanti).
  icons?: Partial<Record<TrayItem, ImageSourcePropType>>;
  // Decor flowers that need a rewarded ad first (shown with a lock).
  locked?: (item: MandirDecor) => boolean;
  lockedLabel?: string;
  onItem: (item: TrayItem) => void;
  onFlower: (item: MandirDecor) => void;
  onGarland: (kind: GarlandKind) => void;
  onBhog: (kind: BhogKind) => void;
  // The temple lights tile, shown where the tilak used to be.
  lights?: {
    label: string;
    image?: ImageSourcePropType;
    icon: React.ReactNode;
    selected: boolean;
    onPress: () => void;
  };
}) {
  // The tilak is not offered from the tray; the lights take its place.
  const tiles = trayItems.map((item) =>
    item === "chandan" ? ("lights" as const) : item,
  );
  return (
    <View style={styles.wrap}>
      {drawer && (
        <View style={styles.drawer} accessibilityRole="menu">
          {drawer.item === "pushp" ? (
            <>
              {drawer.flowers.map((flower) => {
                const name = flower.name[language];
                const isLocked = locked(flower);
                return (
                  <Choice
                    key={flower.id}
                    label={name}
                    a11y={isLocked ? `${name}, ${lockedLabel}` : name}
                    onPress={() => onFlower(flower)}
                  >
                    <Image
                      accessible={false}
                      source={flower.image}
                      resizeMode="contain"
                      fadeDuration={0}
                      style={[
                        { width: 42, height: 42 },
                        isLocked && { opacity: 0.55 },
                      ]}
                    />
                    {isLocked && (
                      <View style={styles.flowerLock}>
                        <Play size={9} color="#FFFFFF" fill="#FFFFFF" />
                        <Lock size={11} color="#FFFFFF" />
                      </View>
                    )}
                  </Choice>
                );
              })}
              <Choice
                label={garlandNames[drawer.garland][language]}
                onPress={() => onGarland(drawer.garland)}
              >
                <Garland
                  kind={drawer.garland}
                  width={46}
                  height={36}
                  imageKey={visuals.garlands[drawer.garland]}
                />
              </Choice>
            </>
          ) : (
            drawer.bhog.map((kind) => (
              <Choice
                key={kind}
                label={bhogNames[kind][language]}
                onPress={() => onBhog(kind)}
              >
                <Bhog kind={kind} size={40} imageKey={visuals.bhog[kind]} />
              </Choice>
            ))
          )}
        </View>
      )}
      <View style={styles.tray}>
        {[tiles.slice(0, 4), tiles.slice(4)].map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((item) =>
              item === "lights" ? (
                lights && <LightsButton key={item} {...lights} />
              ) : (
                <TrayButton
                  key={item}
                  item={item}
                  label={trayLabels[item][language]}
                  hint={trayNames[item][language]}
                  imageKey={visuals.tray[item]}
                  image={icons[item]}
                  done={done.has(item)}
                  glowing={next === item}
                  lit={lit.has(item)}
                  selected={drawer?.item === item}
                  tapKey={tapKeys[item] ?? 0}
                  onPress={() => onItem(item)}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function TrayButton({
  item,
  label,
  hint,
  imageKey,
  image,
  done,
  glowing,
  lit,
  selected,
  tapKey,
  onPress,
}: {
  item: TrayItem;
  label: string;
  hint: string;
  imageKey?: string;
  image?: ImageSourcePropType;
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
          { translateY: -Math.sin(t * Math.PI) * 10 },
          { rotate: `${Math.sin(t * Math.PI) * -20}deg` },
        ],
      };
    return { transform: [{ scale: 1 + Math.sin(t * Math.PI) * 0.18 }] };
  });

  const highlighted = done || selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ selected, checked: done }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        highlighted && styles.tileDone,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {highlighted && (
        <LinearGradient
          colors={["#FFF1D2", shrine.saffronLight]}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
      )}
      <Animated.View pointerEvents="none" style={[styles.glow, ring]} />
      <Animated.View style={[styles.icon, icon]}>
        {image ? (
          <Image
            accessible={false}
            source={image}
            resizeMode="contain"
            fadeDuration={0}
            style={{ width: 56, height: 56 }}
          />
        ) : (
          <SlotImage
            assetKey={imageKey}
            style={{ width: 58, height: 58 }}
            fallback={<TrayIcon item={item} size={52} lit={lit} />}
          />
        )}
      </Animated.View>
      <Txt
        bold
        size={15}
        numberOfLines={1}
        style={{ color: shrine.maroon, textAlign: "center", lineHeight: 20 }}
      >
        {label}
      </Txt>
      {done && (
        <View style={styles.tick}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

// Opens the temple lights chooser; shows the chosen lights.
function LightsButton({
  label,
  image,
  icon,
  selected,
  onPress,
}: {
  label: string;
  image?: ImageSourcePropType;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileDone,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {selected && (
        <LinearGradient
          colors={["#FFF1D2", shrine.saffronLight]}
          style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        />
      )}
      <View style={styles.icon}>
        {image ? (
          <Image
            accessible={false}
            source={image}
            resizeMode="contain"
            fadeDuration={0}
            style={{ width: 56, height: 56 }}
          />
        ) : (
          icon
        )}
      </View>
      <Txt
        bold
        size={15}
        numberOfLines={1}
        style={{ color: shrine.maroon, textAlign: "center", lineHeight: 20 }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

function Choice({
  label,
  a11y,
  onPress,
  children,
}: React.PropsWithChildren<{
  label: string;
  a11y?: string;
  onPress: () => void;
}>) {
  const t = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.sin(t.value * Math.PI) * 0.2 }],
  }));
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={a11y ?? label}
      onPress={() => {
        t.value = 0;
        t.value = withSequence(withTiming(1, { duration: 360 }));
        onPress();
      }}
      style={styles.choice}
    >
      <Animated.View style={style}>{children}</Animated.View>
      <Txt
        size={12}
        numberOfLines={1}
        style={{ color: shrine.ink, lineHeight: 17 }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  // Floats over the bottom of the scene so the temple keeps its size.
  drawer: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    marginBottom: 8,
    zIndex: 5,
    elevation: 6,
    shadowColor: shrine.goldDeep,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    padding: 8,
    borderRadius: 22,
    backgroundColor: shrine.ivory,
    borderWidth: 1,
    borderColor: shrine.line,
  },
  choice: {
    width: 64,
    minHeight: 72,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: "center",
    gap: 2,
    backgroundColor: shrine.card,
    borderWidth: 1,
    borderColor: shrine.lineSoft,
  },
  flowerLock: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
  },
  tray: {
    borderRadius: 24,
    padding: 10,
    gap: 10,
    backgroundColor: "rgba(255, 246, 230, 0.9)",
    borderWidth: 1,
    borderColor: shrine.line,
  },
  row: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    minHeight: 96,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 2,
    backgroundColor: shrine.card,
    borderWidth: 1,
    borderColor: shrine.line,
  },
  tileDone: { borderColor: shrine.saffron, borderWidth: 1.5 },
  icon: { height: 60, alignItems: "center", justifyContent: "center" },
  glow: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: shrine.saffron,
  },
  tick: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: shrine.saffronDeep,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});
