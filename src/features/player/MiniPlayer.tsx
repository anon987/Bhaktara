import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Pause, Play, X } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { IconButton, Row, Txt } from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { usePlayer } from "./PlayerProvider";

// Persistent above the tab bar whenever audio is loaded (doc 03).
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { local, t } = useApp();
  const player = usePlayer();
  const item = player.item;
  if (!item) return null;
  const subtitle =
    player.status === "unavailable"
      ? t("audioUnavailable")
      : player.status === "error"
        ? t("audioError")
        : player.status === "loading" || player.buffering
          ? t("buffering")
          : t("nowPlaying");
  const progress =
    player.duration > 0 ? Math.min(1, player.position / player.duration) : 0;
  return (
    <View
      style={{
        backgroundColor: colors.pale,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      {/* Thin progress line along the top edge. */}
      <View style={{ height: 2, backgroundColor: colors.line }}>
        <View
          style={{
            height: 2,
            width: `${progress * 100}%`,
            backgroundColor: colors.saffron,
          }}
        />
      </View>
      <Row style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("nowPlaying")}: ${item.title[local.language]}`}
          onPress={onOpen}
          style={{
            flex: 1,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            minHeight: 56,
          }}
        >
          <View style={{ width: 44 }}>
            <DevotionalArt assetKey={item.media.thumb.key} size={44} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={13} bold numberOfLines={1}>
              {item.title[local.language]}
            </Txt>
            <Txt size={10} muted numberOfLines={1}>
              {subtitle}
            </Txt>
          </View>
        </Pressable>
        {player.status === "loading" ? (
          <View style={{ width: 48, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : player.status === "ready" ? (
          <IconButton
            icon={player.playing ? Pause : Play}
            label={t(player.playing ? "pause" : "play")}
            onPress={player.toggle}
          />
        ) : null}
        <IconButton icon={X} label={t("close")} onPress={player.close} />
      </Row>
    </View>
  );
}
