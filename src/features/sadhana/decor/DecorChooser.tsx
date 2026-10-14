import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, Lock, Play, X } from "lucide-react-native";
import { Txt } from "../../../components/ui";
import { colors, shrine } from "../../../theme/tokens";
import { MandirDecor } from "./decor";

// A row of big thumbnails to choose the light or the bell. Locked items
// carry a small "Ad" badge (with rewarded ads on, free ones say "Free");
// the chosen one has a saffron ring and a tick. Lights start with "No
// lights". Floats over the bottom of the scene.
export function DecorChooser({
  testID,
  items,
  selectedId,
  locked,
  adsOn,
  language,
  labels,
  none,
  onChoose,
  onClose,
}: {
  testID?: string;
  items: MandirDecor[];
  selectedId: string | null;
  locked: (item: MandirDecor) => boolean;
  adsOn: boolean;
  language: "en" | "hi";
  labels: { ad: string; free: string; close: string; locked: string };
  // Label of the "none" choice (lights), or undefined for none.
  none?: string;
  onChoose: (item: MandirDecor | null) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.panel} testID={testID} accessibilityRole="menu">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {none !== undefined && (
          <Tile
            label={none}
            selected={selectedId === null}
            onPress={() => onChoose(null)}
          >
            <View style={styles.noneIcon}>
              <X size={34} color={shrine.inkMuted} />
            </View>
          </Tile>
        )}
        {items.map((item) => {
          const isLocked = locked(item);
          const name = item.name[language];
          return (
            <Tile
              key={item.id}
              label={name}
              a11y={isLocked ? `${name}, ${labels.locked}` : name}
              selected={item.id === selectedId}
              onPress={() => onChoose(item)}
              badge={
                isLocked ? (
                  <View style={[styles.badge, styles.adBadge]}>
                    <Play size={11} color={colors.white} fill={colors.white} />
                    <Txt bold size={12} style={styles.adText}>
                      {labels.ad}
                    </Txt>
                  </View>
                ) : adsOn && item.unlock === "FREE" ? (
                  <View style={[styles.badge, styles.freeBadge]}>
                    <Txt bold size={12} style={styles.freeText}>
                      {labels.free}
                    </Txt>
                  </View>
                ) : null
              }
            >
              <Image
                accessible={false}
                source={item.image}
                resizeMode="contain"
                fadeDuration={0}
                style={[styles.thumb, isLocked && { opacity: 0.55 }]}
              />
              {isLocked && (
                <View style={styles.lock}>
                  <Lock size={16} color={colors.white} />
                </View>
              )}
            </Tile>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={labels.close}
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
      >
        <X size={26} color={shrine.maroon} />
      </Pressable>
    </View>
  );
}

function Tile({
  label,
  a11y,
  selected,
  badge,
  onPress,
  children,
}: React.PropsWithChildren<{
  label: string;
  a11y?: string;
  selected: boolean;
  badge?: React.ReactNode;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileSelected,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <View style={styles.art}>{children}</View>
      <Txt
        size={13}
        numberOfLines={2}
        style={{ color: shrine.ink, textAlign: "center", lineHeight: 17 }}
      >
        {label}
      </Txt>
      {badge}
      {selected && (
        <View style={styles.tick}>
          <Check size={14} color={colors.white} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingLeft: 8,
    borderRadius: 22,
    backgroundColor: shrine.ivory,
    borderWidth: 1,
    borderColor: shrine.line,
    shadowColor: shrine.goldDeep,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: { gap: 8, paddingRight: 8 },
  tile: {
    width: 88,
    minHeight: 108,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: shrine.card,
    borderWidth: 1.5,
    borderColor: shrine.lineSoft,
  },
  tileSelected: { borderColor: colors.saffron, borderWidth: 2.5 },
  art: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: 64, height: 64 },
  noneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: shrine.line,
    borderStyle: "dashed",
  },
  lock: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107, 15, 18, 0.85)",
  },
  badge: {
    position: "absolute",
    top: -6,
    left: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: 11,
  },
  adBadge: { backgroundColor: colors.primary },
  adText: { color: colors.white, lineHeight: 16 },
  freeBadge: { backgroundColor: colors.green },
  freeText: { color: colors.white, lineHeight: 16 },
  tick: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.saffron,
    borderWidth: 2,
    borderColor: colors.white,
  },
  close: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
