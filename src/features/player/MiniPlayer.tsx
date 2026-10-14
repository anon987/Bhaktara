import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pause, Play, X } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { shrine } from "../../theme/tokens";
import { usePlayer } from "./PlayerProvider";
import { playerColors } from "./PlayerArt";
import { useNowPlayingInfo } from "./nowPlaying";

// Persistent above the tab bar whenever audio is loaded (doc 03): the
// full player's maroon and gold in one bar. Tap it to open the player.
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { t } = useApp();
  const player = usePlayer();
  const item = player.item;
  const info = useNowPlayingInfo(item);
  if (!item || !info) return null;
  const subtitle =
    player.status === "unavailable"
      ? t("audioUnavailable")
      : player.status === "error"
        ? t("audioError")
        : player.status === "loading" || player.buffering
          ? t("buffering")
          : info.subtitle;
  const progress =
    player.duration > 0 ? Math.min(1, player.position / player.duration) : 0;
  return (
    <LinearGradient
      colors={[playerColors.ember, playerColors.maroon]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    >
      {/* Thin gold progress line along the top edge. */}
      <View style={styles.track}>
        <View
          testID="mini-progress"
          style={[styles.fill, { width: `${progress * 100}%` }]}
        />
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("nowPlaying")}: ${info.title}`}
          onPress={onOpen}
          style={({ pressed }) => [styles.open, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.thumbFrame}>
            <View style={styles.thumb}>
              <DevotionalArt assetKey={item.media.thumb.key} size={46} />
            </View>
          </View>
          <View style={styles.text}>
            <Txt bold size={16} numberOfLines={1} style={styles.title}>
              {info.title}
            </Txt>
            <Txt size={14} numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Txt>
          </View>
        </Pressable>
        {player.status === "loading" ? (
          <View style={styles.button}>
            <ActivityIndicator color={playerColors.brassLight} />
          </View>
        ) : player.status === "ready" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(player.playing ? "pause" : "play")}
            onPress={player.toggle}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <View style={styles.play}>
              {player.playing ? (
                <Pause
                  size={24}
                  color={shrine.maroonDeep}
                  fill={shrine.maroonDeep}
                />
              ) : (
                <Play
                  size={24}
                  color={shrine.maroonDeep}
                  fill={shrine.maroonDeep}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          onPress={player.close}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <X size={24} color={playerColors.muted} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, backgroundColor: "rgba(243, 213, 138, 0.25)" },
  fill: { height: 3, backgroundColor: playerColors.brass },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 2,
  },
  open: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
  },
  thumbFrame: {
    padding: 2,
    borderRadius: 12,
    backgroundColor: playerColors.brass,
  },
  thumb: { width: 46, height: 46, borderRadius: 10, overflow: "hidden" },
  text: { flex: 1 },
  title: { color: playerColors.text },
  subtitle: { color: playerColors.brassLight },
  button: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: playerColors.brassLight,
    borderWidth: 2,
    borderColor: playerColors.brass,
  },
  pressed: { opacity: 0.7 },
});
