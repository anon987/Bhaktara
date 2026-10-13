import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoPlayer, VideoView } from "expo-video";
import { useIsFocused } from "@react-navigation/native";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { ContentSource } from "../../app/navigation/routes";
import { DevotionalArt } from "../../components/DevotionalArt";
import { Button, Txt } from "../../components/ui";
import { Content } from "../../domain/models";
import { analytics } from "../../services/analytics";
import { resolveMediaUrl } from "../../services/media/config";
import { colors, radii } from "../../theme/tokens";

// Doc 13: content_complete fires once the viewer reaches 80% of the duration.
const COMPLETE_RATIO = 0.8;

// Status videos show the poster first and create a player only after a tap
// (doc 22 §A5). Nothing here autoplays, and there is no custom animation, so
// reduced-motion users see the same static poster and system spinner.
// `fullBleed` (the status pager) fills the screen: the 9:16 video centred on
// black, with the mute button and notices kept clear of the phone's bars.
export type FullBleed = { top: number; right: number };
export function StatusVideo({
  content,
  source,
  fullBleed,
}: {
  content: Content;
  source: ContentSource;
  fullBleed?: FullBleed;
}) {
  const { t } = useApp();
  const posterKey = (content.media.poster ?? content.media.thumb).key;
  const video = content.media.video720;
  const uri = video ? resolveMediaUrl(video.key) : null;
  const [started, setStarted] = useState(false);
  // Remounting the player on retry builds a fresh native player.
  const [attempt, setAttempt] = useState(0);
  // Once per open, even across retries.
  const played = useRef(false);
  const completed = useRef(false);
  const params = useCallback(
    () => ({
      content_id: content.id,
      content_type: content.type,
      ...(content.deityIds[0] ? { deity_id: content.deityIds[0] } : {}),
      source,
    }),
    [content.id, content.type, content.deityIds, source],
  );
  const onFirstPlay = useCallback(() => {
    if (played.current) return;
    played.current = true;
    analytics.track("content_play", params());
  }, [params]);
  const onComplete = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    analytics.track("content_complete", params());
  }, [params]);

  if (!uri)
    return (
      <Frame
        fullBleed={fullBleed}
        chrome={
          <View
            style={[
              styles.banner,
              fullBleed && {
                top: fullBleed.top + 64,
                bottom: undefined,
                left: 18,
                right: fullBleed.right + 4,
              },
            ]}
          >
            <Txt bold size={fullBleed ? 16 : 13} style={styles.light}>
              {t("videoUnavailable")}
            </Txt>
          </View>
        }
      >
        <DevotionalArt assetKey={posterKey} size="100%" square={!!fullBleed} />
      </Frame>
    );
  if (!started)
    return (
      <Frame fullBleed={fullBleed}>
        <DevotionalArt assetKey={posterKey} size="100%" square={!!fullBleed} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("playVideo")}
          onPress={() => setStarted(true)}
          style={({ pressed }) => [styles.overlay, pressed && styles.pressed]}
        >
          <PlayBadge large={!!fullBleed} />
        </Pressable>
      </Frame>
    );
  return (
    <StatusVideoPlayer
      key={attempt}
      uri={uri}
      posterKey={posterKey}
      fullBleed={fullBleed}
      onFirstPlay={onFirstPlay}
      onComplete={onComplete}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

// The card frame, or the full-bleed one: black, with the 9:16 box centred.
// `chrome` sits over the whole frame (the mute button, notices).
function Frame({
  fullBleed,
  black,
  chrome,
  children,
}: React.PropsWithChildren<{
  fullBleed?: FullBleed;
  black?: boolean;
  chrome?: React.ReactNode;
}>) {
  if (!fullBleed)
    return (
      <View style={[styles.frame, black && styles.black]} testID="status-video">
        {children}
        {chrome}
      </View>
    );
  return (
    <View style={styles.fill} testID="status-video">
      <View style={styles.fillBox}>{children}</View>
      {chrome}
    </View>
  );
}

function StatusVideoPlayer({
  uri,
  posterKey,
  fullBleed,
  onFirstPlay,
  onComplete,
  onRetry,
}: {
  uri: string;
  posterKey: string;
  fullBleed?: FullBleed;
  onFirstPlay: () => void;
  onComplete: () => void;
  onRetry: () => void;
}) {
  const { t } = useApp();
  const focused = useIsFocused();
  // Mounted only after the user's tap, so starting playback here answers that
  // tap. useVideoPlayer releases the native player when this unmounts.
  const player = useVideoPlayer(uri, (value) => {
    value.loop = false;
    value.timeUpdateEventInterval = 0.5;
    value.play();
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });
  const [firstFrame, setFirstFrame] = useState(false);
  const [ended, setEnded] = useState(false);

  // content_play waits for real playback, not the tap or buffering.
  useEffect(() => {
    if (isPlaying) onFirstPlay();
  }, [isPlaying, onFirstPlay]);
  useEventListener(player, "playingChange", ({ isPlaying: playing }) => {
    if (playing) setEnded(false);
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const duration = player.duration;
    if (duration > 0 && currentTime / duration >= COMPLETE_RATIO) onComplete();
  });
  useEventListener(player, "playToEnd", () => {
    setEnded(true);
    onComplete();
  });
  // Leaving the screen (another route, tab or the player) pauses playback.
  // Returning does not resume it; the viewer taps again.
  useEffect(() => {
    if (!focused) player.pause();
  }, [focused, player]);

  if (status === "error")
    return (
      <Frame fullBleed={fullBleed}>
        <DevotionalArt assetKey={posterKey} size="100%" square={!!fullBleed} />
        <View style={[styles.overlay, styles.scrim]}>
          <Txt bold style={[styles.light, { textAlign: "center" }]}>
            {t("videoError")}
          </Txt>
          <Button icon={RotateCcw} label={t("retry")} onPress={onRetry} />
        </View>
      </Frame>
    );
  const loading = status === "loading" || status === "idle";
  const toggle = () => {
    if (isPlaying) player.pause();
    else if (ended) player.replay();
    else player.play();
  };
  const mute = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(muted ? "unmuteVideo" : "muteVideo")}
      accessibilityState={{ selected: muted }}
      onPress={() => setMuted(player, !muted)}
      hitSlop={8}
      style={({ pressed }) => [
        styles.mute,
        fullBleed && [
          styles.muteLarge,
          { top: fullBleed.top, right: fullBleed.right, bottom: undefined },
        ],
        pressed && styles.pressed,
      ]}
    >
      {muted ? (
        <VolumeX size={fullBleed ? 26 : 20} color={colors.white} />
      ) : (
        <Volume2 size={fullBleed ? 26 : 20} color={colors.white} />
      )}
    </Pressable>
  );
  return (
    <Frame fullBleed={fullBleed} black chrome={mute}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setFirstFrame(true)}
        style={StyleSheet.absoluteFill}
      />
      {!firstFrame && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <DevotionalArt
            assetKey={posterKey}
            size="100%"
            square={!!fullBleed}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          isPlaying ? "pauseVideo" : ended ? "replayVideo" : "playVideo",
        )}
        onPress={toggle}
        style={styles.overlay}
      >
        {loading ? (
          <View style={styles.badge}>
            <ActivityIndicator
              color={colors.white}
              accessibilityLabel={t("videoLoading")}
            />
          </View>
        ) : (
          !isPlaying && <PlayBadge replay={ended} large={!!fullBleed} />
        )}
      </Pressable>
    </Frame>
  );
}

// The native player is a mutable shared object; writes go through here so the
// React Compiler lint does not mistake them for mutating hook state.
function setMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

function PlayBadge({ replay, large }: { replay?: boolean; large?: boolean }) {
  const Icon = replay ? RotateCcw : Play;
  return (
    <View style={[styles.badge, large && styles.badgeLarge]}>
      <Icon
        size={large ? 40 : 30}
        color={colors.white}
        fill={replay ? "none" : colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Status videos are vertical 9:16; cap the width so the frame fits on screen.
  frame: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 9 / 16,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
  },
  black: { backgroundColor: "#000000" },
  // Full bleed: the whole page is black, the 9:16 box centred within it.
  fill: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  fillBox: {
    width: "100%",
    maxHeight: "100%",
    aspectRatio: 9 / 16,
    alignSelf: "center",
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  scrim: { backgroundColor: "#00000099" },
  pressed: { opacity: 0.72 },
  badge: {
    width: 68,
    height: 68,
    borderRadius: radii.pill,
    backgroundColor: "#00000080",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLarge: { width: 88, height: 88 },
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#000000A6",
  },
  light: { color: colors.white },
  mute: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: "#00000080",
    alignItems: "center",
    justifyContent: "center",
  },
  // Same size and scrim as the pager's back button.
  muteLarge: {
    width: 52,
    height: 52,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
});
