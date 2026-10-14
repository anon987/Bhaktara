import React, { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Heart, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  IconButton,
  Notice,
  Page,
  Progress,
  Row,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { formatTime } from "../../domain/practice";
import { isPlaceholderKey } from "../../domain/media";
import { usePlayer } from "./PlayerProvider";
import { LyricsSection } from "./LyricsSection";

const SKIP_SECONDS = 15;

export function PlayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Player">) {
  const { local, t, toggleFavorite } = useApp();
  const player = usePlayer();
  const [barWidth, setBarWidth] = useState(0);
  const item = player.item;
  if (!item)
    return (
      <Page title={t("nowPlaying")} onBack={navigation.goBack}>
        <Txt>{t("noResults")}</Txt>
      </Page>
    );
  const ready = player.status === "ready";
  const duration = player.duration || item.durationSeconds || 0;
  const position = Math.min(player.position, duration || player.position);
  const favorite = local.favorites.includes(item.id);
  return (
    <Page title={t("nowPlaying")} onBack={navigation.goBack}>
      <DevotionalArt assetKey={item.media.thumb.key} size={320} />
      {isPlaceholderKey(item.media.thumb.key) && (
        <Txt size={11} muted style={{ textAlign: "center" }}>
          {t("placeholder")}
        </Txt>
      )}
      <Row>
        <View style={{ flex: 1 }}>
          <Txt bold size={25}>
            {item.title[local.language]}
          </Txt>
          <Txt muted size={13}>
            Bhaktara
          </Txt>
        </View>
        <IconButton
          icon={Heart}
          selected={favorite}
          color={colors.primary}
          label={t(favorite ? "unfavorite" : "favorite")}
          onPress={() => toggleFavorite(item.id)}
        />
      </Row>
      {/* Tap anywhere on the bar to seek; screen readers adjust in 15 s steps. */}
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={t("playbackPosition")}
        accessibilityValue={{
          min: 0,
          max: Math.round(duration),
          now: Math.round(position),
          text: `${formatTime(Math.floor(position))} / ${formatTime(Math.floor(duration))}`,
        }}
        accessibilityActions={[
          { name: "increment", label: t("seekForward") },
          { name: "decrement", label: t("seekBack") },
        ]}
        onAccessibilityAction={(event) =>
          player.seekBy(
            event.nativeEvent.actionName === "increment"
              ? SKIP_SECONDS
              : -SKIP_SECONDS,
          )
        }
        disabled={!ready || !duration}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          if (barWidth > 0)
            player.seekTo((event.nativeEvent.locationX / barWidth) * duration);
        }}
        hitSlop={{ top: 16, bottom: 16 }}
        style={{ paddingVertical: 8 }}
      >
        <Progress
          value={duration ? position / duration : 0}
          label={t("playbackPosition")}
        />
      </Pressable>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={12} muted>
          {formatTime(Math.floor(position))}
        </Txt>
        <Txt size={12} muted>
          {formatTime(Math.floor(duration))}
        </Txt>
      </Row>
      <Row style={{ justifyContent: "center", gap: 28 }}>
        <IconButton
          icon={RotateCcw}
          label={t("seekBack")}
          onPress={() => player.seekBy(-SKIP_SECONDS)}
        />
        <Button
          style={{ minWidth: 130, minHeight: 70, borderRadius: 35 }}
          icon={player.playing ? Pause : Play}
          label={t(player.playing ? "pause" : "play")}
          disabled={!ready}
          onPress={player.toggle}
        />
        <IconButton
          icon={RotateCw}
          label={t("seekForward")}
          onPress={() => player.seekBy(SKIP_SECONDS)}
        />
      </Row>
      {(player.status === "loading" || (ready && player.buffering)) && (
        <Row style={{ justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Txt muted size={13}>
            {t("buffering")}
          </Txt>
        </Row>
      )}
      {player.status === "unavailable" && (
        <Notice text={t("audioUnavailable")} />
      )}
      {player.status === "error" && (
        <>
          <Notice text={t("audioError")} />
          <Button secondary label={t("retry")} onPress={player.retry} />
        </>
      )}
      <LyricsSection lyrics={item.lyrics} />
    </Page>
  );
}
