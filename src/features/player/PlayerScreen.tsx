import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AlertCircle, BookOpen, ChevronDown } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import { isPlaceholderKey } from "../../domain/media";
import { lyricsForLanguage } from "../../domain/lyrics";
import { analytics } from "../../services/analytics";
import { fonts, shrine } from "../../theme/tokens";
import { usePlayer, type PlayerStatus } from "./PlayerProvider";
import { LyricsSection } from "./LyricsSection";
import {
  PlayerArtwork,
  PlayerBackdrop,
  PlayerGarland,
  playerColors,
} from "./PlayerArt";
import { SeekBar } from "./SeekBar";
import { PlayerActions, TransportControls } from "./PlayerControls";
import { useNowPlayingInfo } from "./nowPlaying";

// The full-screen player: a lamp-lit sanctum (maroon to a saffron glow)
// under a marigold garland. One vertical scroll: artwork, titles, the seek
// bar, the controls, the actions, then the lyrics.
//
// Every playback update (twice a second) re-renders this screen; the
// decoration, artwork, titles and controls are memoised and only the
// SeekBar follows the position.
export function PlayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Player">) {
  const { local, t, toggleFavorite } = useApp();
  const player = usePlayer();
  const item = player.item;
  const info = useNowPlayingInfo(item);
  const reduced = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const [lyricsY, setLyricsY] = useState<number | null>(null);
  const hasLyrics = useMemo(
    () => !!item && lyricsForLanguage(item.lyrics, local.language) !== null,
    [item, local.language],
  );
  const itemId = item?.id;
  const onFavorite = useCallback(() => {
    if (itemId) toggleFavorite(itemId);
  }, [itemId, toggleFavorite]);
  const title = info?.title ?? "";
  const itemType = item?.type;
  const onShare = useCallback(() => {
    if (!itemId || !itemType) return;
    Share.share({
      message: t("sharePlayerMessage").replace("{title}", title),
    })
      .then((result) => {
        if (result.action === Share.sharedAction)
          analytics.track("content_share", {
            content_id: itemId,
            content_type: itemType,
            channel: "other",
          });
      })
      .catch(() => undefined);
  }, [itemId, itemType, t, title]);
  const showLyrics = () => {
    if (lyricsY !== null)
      scroll.current?.scrollTo({ y: lyricsY - 12, animated: !reduced });
  };

  const ready = player.status === "ready";
  const loading = player.status === "loading" || (ready && player.buffering);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <PlayerBackdrop />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fill}>
        <PlayerGarland />
        <PlayerHeader onClose={navigation.goBack} />
        {!item || !info ? (
          <View style={styles.empty}>
            <Txt size={18} style={{ color: playerColors.text }}>
              {t("noResults")}
            </Txt>
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <PlayerArtwork thumb={item.media.thumb} playing={player.playing} />
            {isPlaceholderKey(item.media.thumb.key) && (
              <Txt size={14} style={styles.placeholder}>
                {t("placeholder")}
              </Txt>
            )}
            <PlayerTitles
              title={info.title}
              otherTitle={info.otherTitle}
              subtitle={info.subtitle}
            />
            <PlayerStatusNote
              status={player.status}
              buffering={player.buffering}
              onRetry={player.retry}
            />
            <SeekBar />
            <TransportControls
              playing={player.playing}
              ready={ready}
              loading={loading}
              onToggle={player.toggle}
              onSeekBy={player.seekBy}
            />
            {hasLyrics && (
              <Pressable
                testID="player-lyrics-chip"
                accessibilityRole="button"
                onPress={showLyrics}
                style={({ pressed }) => [
                  styles.lyricsChip,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <BookOpen size={22} color={shrine.maroon} />
                <Txt bold size={17} style={{ color: shrine.maroon }}>
                  {t("showLyrics")}
                </Txt>
                <ChevronDown size={22} color={shrine.maroon} />
              </Pressable>
            )}
            <PlayerActions
              favorite={local.favorites.includes(item.id)}
              repeat={player.repeat}
              sleepAt={player.sleepAt}
              sleepAtEnd={player.sleepAtEnd}
              onFavorite={onFavorite}
              onRepeat={player.setRepeat}
              onSleep={player.setSleep}
              onShare={onShare}
            />
            {hasLyrics && (
              <View
                onLayout={(event) => setLyricsY(event.nativeEvent.layout.y)}
              >
                <LyricsSection lyrics={item.lyrics} />
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// A down chevron (back to where the devotee was) and "Now playing".
const PlayerHeader = React.memo(function PlayerHeader({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useApp();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("closePlayer")}
        onPress={onClose}
        hitSlop={8}
        style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
      >
        <ChevronDown size={32} color={playerColors.brassLight} />
      </Pressable>
      <Txt
        bold
        size={18}
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.headerLabel}
      >
        {t("nowPlaying")}
      </Txt>
      <View style={styles.close} />
    </View>
  );
});

const PlayerTitles = React.memo(function PlayerTitles({
  title,
  otherTitle,
  subtitle,
}: {
  title: string;
  otherTitle: string | null;
  subtitle: string;
}) {
  const language = useApp().local.language;
  return (
    <View style={styles.titles}>
      <Txt
        bold
        size={26}
        numberOfLines={2}
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </Txt>
      {otherTitle && (
        <Txt
          size={17}
          numberOfLines={2}
          style={[
            styles.otherTitle,
            // The other title is Hindi when the app is in English.
            language === "en" && { fontFamily: fonts.hi },
          ]}
        >
          {otherTitle}
        </Txt>
      )}
      {!!subtitle && (
        <View style={styles.subtitleRow}>
          <View style={styles.dot} />
          <Txt
            testID="player-subtitle"
            bold
            size={17}
            numberOfLines={1}
            style={styles.subtitle}
          >
            {subtitle}
          </Txt>
          <View style={styles.dot} />
        </View>
      )}
    </View>
  );
});

// Loading, unavailable and error states, between the titles and the seek
// bar so they are never hidden behind the artwork.
const PlayerStatusNote = React.memo(function PlayerStatusNote({
  status,
  buffering,
  onRetry,
}: {
  status: PlayerStatus;
  buffering: boolean;
  onRetry: () => void;
}) {
  const { t } = useApp();
  if (status === "loading" || (status === "ready" && buffering))
    return (
      <View style={styles.loadingRow} accessibilityLiveRegion="polite">
        <ActivityIndicator color={playerColors.brassLight} />
        <Txt size={16} style={{ color: playerColors.muted }}>
          {t("buffering")}
        </Txt>
      </View>
    );
  if (status !== "unavailable" && status !== "error") return null;
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <View style={styles.noteRow}>
        <AlertCircle size={22} color={shrine.maroon} />
        <Txt size={16} style={styles.noteText}>
          {t(status === "error" ? "audioError" : "audioUnavailable")}
        </Txt>
      </View>
      {status === "error" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("retry")}
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}
        >
          <Txt bold size={17} style={{ color: shrine.ivory }}>
            {t("retry")}
          </Txt>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: playerColors.top },
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: -6,
  },
  close: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
  },
  headerLabel: {
    flex: 1,
    textAlign: "center",
    color: playerColors.brassLight,
    letterSpacing: 0.3,
  },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 8 },
  placeholder: { color: playerColors.muted, textAlign: "center" },
  titles: { alignItems: "center", gap: 2, marginTop: 6 },
  title: {
    color: playerColors.text,
    textAlign: "center",
    lineHeight: 36,
  },
  otherTitle: { color: playerColors.muted, textAlign: "center" },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    maxWidth: "100%",
  },
  subtitle: { color: playerColors.brass, flexShrink: 1 },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: playerColors.brass,
    transform: [{ rotate: "45deg" }],
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 32,
  },
  note: {
    backgroundColor: shrine.parchment,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: shrine.gold,
    padding: 14,
    gap: 12,
    marginTop: 6,
  },
  noteRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noteText: { color: shrine.ink, flex: 1 },
  retry: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: shrine.maroon,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  lyricsChip: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
    marginTop: 14,
    borderRadius: 26,
    backgroundColor: shrine.parchment,
    borderWidth: 2,
    borderColor: playerColors.brass,
  },
});
