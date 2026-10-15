import React, { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { BookOpen, Share2 } from "lucide-react-native";
import { DevotionalArt } from "../../components/DevotionalArt";
import { Txt } from "../../components/ui";
import { useReducedMotion } from "../../components/useReducedMotion";
import type { LyricsLanguage } from "../../domain/lyrics";
import type { MediaVariant } from "../../domain/media";
import { resolveMediaUrl } from "../../services/media/config";
import { sanctum } from "../../theme/tokens";
import { MarigoldBlooms, type Bloom } from "../sadhana/art/Marigold";
import { LyricsOverlay } from "./LyricsSection";
import { PLAYER_LAYOUT } from "./playerLayout";

const useNativeDriver = Platform.OS !== "web";

// The player's colours: a lamp-lit sanctum (deep maroon) warming to a
// saffron glow, with cream text and brass for what you press.
export const playerColors = {
  top: "#260A07",
  maroon: sanctum.maroon,
  ember: "#6E2513",
  glow: "#A34A1B",
  text: sanctum.text,
  muted: sanctum.textMuted,
  brass: sanctum.brass,
  brassLight: sanctum.brassLight,
  brassDeep: sanctum.brassDeep,
  // Pressable surfaces on the dark ground.
  well: "rgba(255, 230, 168, 0.1)",
  wellBorder: "rgba(243, 213, 138, 0.45)",
};

// The full-bleed background: deep maroon at the top to a saffron glow below.
export const PlayerBackdrop = React.memo(function PlayerBackdrop() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        playerColors.top,
        playerColors.maroon,
        playerColors.ember,
        playerColors.glow,
      ]}
      locations={[0, 0.38, 0.75, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
});

// A light bandhanwar along the top: one thread of swags with mango leaves
// and marigolds. Every leaf shares one <Path> and the blooms three, so the
// garland is a handful of SVG nodes however wide the phone.
export const PlayerGarland = React.memo(function PlayerGarland({
  height = 34,
}: {
  height?: number;
}) {
  const { width } = useWindowDimensions();
  const swags = Math.max(3, Math.round(width / 130));
  const span = width / swags;
  const sag = height * 0.36;
  let thread = "M0 4";
  let leaves = "";
  const blooms: Bloom[] = [];
  for (let i = 0; i < swags; i += 1) {
    const x0 = i * span;
    thread += ` Q ${x0 + span / 2} ${4 + sag * 2} ${x0 + span} 4`;
    for (let j = 1; j <= 3; j += 1) {
      const t = j / 4;
      const x = x0 + t * span;
      // The point on the swag (control point at 4 + 2·sag) at t.
      const y = 4 + 4 * t * (1 - t) * sag;
      if (j === 2) {
        blooms.push({ cx: x, cy: y + 5, r: height * 0.17 });
      } else {
        // A mango leaf hanging from the thread.
        const length = height * 0.62;
        const w = length * 0.3;
        leaves += `M${x} ${y} C ${x + w} ${y + length * 0.3} ${x + w * 0.7} ${y + length * 0.75} ${x} ${y + length} C ${x - w * 0.7} ${y + length * 0.75} ${x - w} ${y + length * 0.3} ${x} ${y} Z `;
      }
    }
  }
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{ width, height, opacity: 0.9 }}
    >
      <Svg width={width} height={height}>
        <Path d={leaves} fill={sanctum.leaf} />
        <Path d={thread} stroke={sanctum.brass} strokeWidth={1.6} fill="none" />
        <MarigoldBlooms blooms={blooms} />
      </Svg>
    </View>
  );
});

// Artwork is shown at its own shape: square art stays square, landscape
// album covers (1408×768) show wide. Clamped between 1:1 and 16:9.
export const MAX_ART_RATIO = 16 / 9;
export function clampArtRatio(width?: number, height?: number) {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  return Math.min(MAX_ART_RATIO, Math.max(1, width / height));
}
// Measured image shapes, so reopening the player never jumps.
const measured = new Map<string, number>();

// The thumb's width ÷ height: from the variant's metadata when the catalog
// has it, else measured once from the image. 1 (square) until known.
export function useArtRatio(thumb: MediaVariant | undefined) {
  const known =
    thumb?.width && thumb.height
      ? clampArtRatio(thumb.width, thumb.height)
      : null;
  const uri = known === null && thumb ? resolveMediaUrl(thumb.key) : null;
  const [result, setResult] = useState<{ uri: string; ratio: number } | null>(
    null,
  );
  useEffect(() => {
    if (!uri || measured.has(uri)) return;
    let active = true;
    try {
      Image.getSize(
        uri,
        (width, height) => {
          const ratio = clampArtRatio(width, height);
          measured.set(uri, ratio);
          if (active) setResult({ uri, ratio });
        },
        // Unknown size: the frame stays square.
        () => undefined,
      );
    } catch {
      // As above.
    }
    return () => {
      active = false;
    };
  }, [uri]);
  if (known !== null) return known;
  if (!uri) return 1;
  return measured.get(uri) ?? (result?.uri === uri ? result.ratio : 1);
}

const FRAME_RADIUS = 24;
const GLOW_RINGS = [6, 12, 18, 24];

// The artwork in a temple-gold frame, with a soft diya glow behind it that
// breathes gently while the bhajan plays (still when paused or with reduced
// motion). The glow is rounded rings of the frame's own shape, animated on
// its own layer; nothing inside the frame moves with it. `width` and
// `height` are the art's size inside the frame (from computePlayerLayout).
// Without lyrics the art keeps its shape (`ratio`); with lyrics shown, the
// frame takes all the space it is given and the art fades, cover-cropped,
// under a warm scrim. Share sits on the top-right corner and the lyrics
// toggle (when there are lyrics) on the top-left.
export const PlayerArtwork = React.memo(function PlayerArtwork({
  thumb,
  ratio,
  width,
  height,
  playing,
  caption,
  lyrics,
  lyricsShown,
  lyricsLabel,
  onToggleLyrics,
  shareLabel,
  onShare,
}: {
  thumb: MediaVariant;
  ratio: number;
  width: number;
  height: number;
  playing: boolean;
  // A short note over the bottom of the art (e.g. placeholder artwork).
  caption?: string;
  lyrics: { language: LyricsLanguage; stanzas: string[][] } | null;
  lyricsShown: boolean;
  lyricsLabel: string;
  onToggleLyrics: () => void;
  shareLabel: string;
  onShare: () => void;
}) {
  const overLyrics = !!lyrics && lyricsShown;
  const reduced = useReducedMotion();
  const [breath] = useState(() => new Animated.Value(0));
  const breathing = playing && !reduced;
  useEffect(() => {
    if (!breathing) {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathing, breath]);
  return (
    <View
      style={[styles.wrap, { width: width + PLAYER_LAYOUT.framePadding * 2 }]}
    >
      <Animated.View
        accessible={false}
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: breath.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1],
            }),
            transform: [
              {
                scale: breath.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.98, 1.035],
                }),
              },
            ],
          },
        ]}
      >
        {GLOW_RINGS.map((spread) => (
          <View
            key={spread}
            style={[
              styles.ring,
              {
                top: -spread,
                left: -spread,
                right: -spread,
                bottom: -spread,
                borderRadius: FRAME_RADIUS + spread,
              },
            ]}
          />
        ))}
      </Animated.View>
      <LinearGradient
        colors={[sanctum.brassLight, sanctum.brass, sanctum.brassDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frame}
      >
        <View
          testID="player-art"
          style={[
            styles.inner,
            overLyrics ? { width, height } : { width, aspectRatio: ratio },
          ]}
        >
          <View
            testID="player-art-image"
            style={[StyleSheet.absoluteFill, overLyrics && styles.faded]}
          >
            <DevotionalArt assetKey={thumb.key} size="100%" />
          </View>
          {overLyrics && (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(52, 14, 9, 0.62)", "rgba(24, 7, 5, 0.7)"]}
                style={StyleSheet.absoluteFill}
              />
              <LyricsOverlay
                language={lyrics.language}
                stanzas={lyrics.stanzas}
              />
            </>
          )}
          {!!caption && !overLyrics && (
            <View pointerEvents="none" style={styles.caption}>
              <Txt size={14} numberOfLines={2} style={styles.captionText}>
                {caption}
              </Txt>
            </View>
          )}
          <Pressable
            testID="player-share"
            accessibilityRole="button"
            accessibilityLabel={shareLabel}
            onPress={onShare}
            hitSlop={4}
            style={({ pressed }) => [
              styles.corner,
              styles.cornerRight,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Share2 size={22} color="#FFFFFF" />
          </Pressable>
          {!!lyrics && (
            <Pressable
              testID="player-lyrics-toggle"
              accessibilityRole="button"
              accessibilityLabel={lyricsLabel}
              accessibilityState={{ selected: lyricsShown }}
              onPress={onToggleLyrics}
              hitSlop={4}
              style={({ pressed }) => [
                styles.corner,
                styles.cornerLeft,
                lyricsShown && styles.cornerOn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <BookOpen
                size={22}
                color={lyricsShown ? sanctum.brassLight : "#FFFFFF"}
              />
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </View>
  );
});

const SHARE_SIZE = 44;

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    marginTop: PLAYER_LAYOUT.artMarginTop,
    marginBottom: PLAYER_LAYOUT.artMarginBottom,
  },
  ring: {
    position: "absolute",
    backgroundColor: sanctum.flame,
    opacity: 0.13,
  },
  frame: {
    borderRadius: FRAME_RADIUS,
    padding: PLAYER_LAYOUT.framePadding,
  },
  inner: {
    borderRadius: FRAME_RADIUS - PLAYER_LAYOUT.framePadding,
    overflow: "hidden",
    backgroundColor: sanctum.night,
  },
  faded: { opacity: 0.28 },
  corner: {
    position: "absolute",
    top: 10,
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    borderRadius: SHARE_SIZE / 2,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  cornerRight: { right: 10 },
  cornerLeft: { left: 10 },
  cornerOn: { borderWidth: 1.5, borderColor: sanctum.brassLight },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  captionText: { color: sanctum.text, textAlign: "center" },
});
