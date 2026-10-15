import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AlertCircle, ChevronDown } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { isPlaceholderKey } from "../../domain/media";
import { lyricsForLanguage } from "../../domain/lyrics";
import { analytics } from "../../services/analytics";
import { fonts, shrine } from "../../theme/tokens";
import { usePlayer, type PlayerStatus } from "./PlayerProvider";
import {
  PlayerArtwork,
  PlayerBackdrop,
  PlayerGarland,
  playerColors,
  useArtRatio,
} from "./PlayerArt";
import { SeekBar } from "./SeekBar";
import { TransportControls } from "./PlayerControls";
import { useNowPlayingInfo } from "./nowPlaying";
import {
  computePlayerLayout,
  PLAYER_LAYOUT,
  PLAYER_MAX_FONT_SCALE,
} from "./playerLayout";

// The full-screen player: a lamp-lit sanctum (maroon to a saffron glow)
// under a marigold garland. One screen, no page scroll: the artwork (with
// the lyrics over it, when there are any), titles, the seek bar, a notice
// line and the controls. The artwork is sized from what the other parts
// leave over (computePlayerLayout).
//
// Every playback update (twice a second) re-renders this screen; the
// decoration, artwork, titles and controls are memoised and only the
// SeekBar follows the position.
export function PlayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Player">) {
  const { local, t } = useApp();
  const player = usePlayer();
  const item = player.item;
  const info = useNowPlayingInfo(item);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ratio = useArtRatio(item?.media.thumb);
  const lyrics = useMemo(
    () => (item ? lyricsForLanguage(item.lyrics, local.language) : null),
    [item, local.language],
  );
  const itemId = item?.id;
  // Lyrics show over the art by default; hiding them lasts for this item.
  const [lyricsHiddenFor, setLyricsHiddenFor] = useState<string | null>(null);
  const lyricsShown = !!lyrics && lyricsHiddenFor !== itemId;
  const onToggleLyrics = useCallback(
    () => setLyricsHiddenFor(lyricsShown ? (itemId ?? null) : null),
    [itemId, lyricsShown],
  );
  const layout = useMemo(
    () =>
      computePlayerLayout({
        width: window.width,
        height: window.height,
        fontScale: window.fontScale,
        insets,
        ratio,
        fill: lyricsShown,
      }),
    [window.width, window.height, window.fontScale, insets, ratio, lyricsShown],
  );
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

  const ready = player.status === "ready";
  const loading = player.status === "loading" || (ready && player.buffering);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <PlayerBackdrop />
      <SafeAreaView
        edges={["top", "bottom", "left", "right"]}
        style={styles.fill}
      >
        <PlayerGarland height={PLAYER_LAYOUT.garland} />
        <PlayerHeader onClose={navigation.goBack} />
        {!item || !info ? (
          <View style={styles.empty}>
            <Txt size={18} style={{ color: playerColors.text }}>
              {t("noResults")}
            </Txt>
          </View>
        ) : (
          <View testID="player-page" style={styles.content}>
            <View style={styles.artSlot}>
              <PlayerArtwork
                thumb={item.media.thumb}
                ratio={ratio}
                width={layout.artWidth}
                height={layout.artHeight}
                playing={player.playing}
                caption={
                  isPlaceholderKey(item.media.thumb.key)
                    ? t("placeholder")
                    : undefined
                }
                lyrics={lyrics}
                lyricsShown={lyricsShown}
                lyricsLabel={t(lyricsShown ? "hideLyrics" : "showLyrics")}
                onToggleLyrics={onToggleLyrics}
                shareLabel={t("sharePlayer")}
                onShare={onShare}
              />
            </View>
            <PlayerTitles
              title={info.title}
              otherTitle={info.otherTitle}
              subtitle={info.subtitle}
              titleLines={layout.titleLines}
            />
            <SeekBar />
            <PlayerStatusNote
              status={player.status}
              buffering={player.buffering}
              onRetry={player.retry}
            />
            <TransportControls
              playing={player.playing}
              ready={ready}
              loading={loading}
              repeat={player.repeat}
              onToggle={player.toggle}
              onSeekBy={player.seekBy}
              onRepeat={player.setRepeat}
            />
          </View>
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
        maxFontSizeMultiplier={PLAYER_MAX_FONT_SCALE}
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
  titleLines,
}: {
  title: string;
  otherTitle: string | null;
  subtitle: string;
  titleLines: number;
}) {
  const language = useApp().local.language;
  return (
    <View style={styles.titles}>
      <Txt
        bold
        size={26}
        numberOfLines={titleLines}
        maxFontSizeMultiplier={PLAYER_MAX_FONT_SCALE}
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </Txt>
      {otherTitle && (
        <Txt
          size={17}
          numberOfLines={1}
          maxFontSizeMultiplier={PLAYER_MAX_FONT_SCALE}
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
            maxFontSizeMultiplier={PLAYER_MAX_FONT_SCALE}
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

// One line under the seek bar, always reserved so nothing moves: loading,
// unavailable, or an error with a retry button.
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
  let content: React.ReactNode = null;
  if (status === "loading" || (status === "ready" && buffering))
    content = (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={playerColors.brassLight} />
        <Txt
          size={16}
          numberOfLines={1}
          maxFontSizeMultiplier={PLAYER_MAX_FONT_SCALE}
          style={{ color: playerColors.muted }}
        >
          {t("buffering")}
        </Txt>
      </View>
    );
  else if (status === "unavailable" || status === "error")
    content = (
      <View style={styles.note}>
        <AlertCircle size={20} color={shrine.maroon} />
        <Txt
          size={14}
          numberOfLines={2}
          maxFontSizeMultiplier={1.2}
          style={styles.noteText}
        >
          {t(status === "error" ? "audioErrorShort" : "audioUnavailable")}
        </Txt>
        {status === "error" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("retry")}
            onPress={onRetry}
            hitSlop={6}
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}
          >
            <Txt
              bold
              size={15}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={{ color: shrine.ivory }}
            >
              {t("retry")}
            </Txt>
          </Pressable>
        )}
      </View>
    );
  return (
    <View style={styles.noticeSlot} accessibilityLiveRegion="polite">
      {content}
    </View>
  );
});

const L = PLAYER_LAYOUT;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: playerColors.top },
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: L.header - 52,
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
  content: {
    flex: 1,
    paddingHorizontal: L.sidePadding,
    paddingBottom: L.bottomPadding,
  },
  // Any height the layout didn't need goes around the artwork.
  artSlot: { flex: 1, justifyContent: "center" },
  titles: { alignItems: "center", marginTop: L.titlesMarginTop },
  title: {
    color: playerColors.text,
    textAlign: "center",
    lineHeight: L.titleLine,
  },
  otherTitle: {
    color: playerColors.muted,
    textAlign: "center",
    lineHeight: L.otherTitleLine,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: L.subtitleMarginTop,
    maxWidth: "100%",
  },
  subtitle: {
    color: playerColors.brass,
    flexShrink: 1,
    lineHeight: L.subtitleLine,
  },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: playerColors.brass,
    transform: [{ rotate: "45deg" }],
  },
  noticeSlot: { height: L.notice, justifyContent: "center" },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: L.notice - 4,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: (L.notice - 4) / 2,
    backgroundColor: shrine.parchment,
    borderWidth: 1.5,
    borderColor: shrine.gold,
  },
  noteText: { color: shrine.ink, flex: 1, lineHeight: 18 },
  retry: {
    height: 34,
    borderRadius: 17,
    backgroundColor: shrine.maroon,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
