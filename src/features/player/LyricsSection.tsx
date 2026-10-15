import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Txt } from "../../components/ui";
import type { LyricsLanguage } from "../../domain/lyrics";
import { fonts, sanctum } from "../../theme/tokens";

const LYRIC_SIZE = 20;
const LYRIC_LINE = 30;
// Clear of the round buttons on the art's top corners (10 inset + 44).
const TOP_PADDING = 64;
const FADE = 28;
// Matches the scrim at the edges, so the lines fade in and out.
const EDGE = "rgba(24, 7, 5, 0.92)";
const CLEAR = "rgba(24, 7, 5, 0)";

// The song's lyrics over the faded artwork, inside the gold frame: their own
// vertical scroll (the page doesn't scroll), centred stanzas in cream with a
// soft shadow, and fades at the top and bottom edges. Stanzas come from
// lyricsForLanguage, which drops section notes such as "[Chorus — Mukhda]".
// Memoised: the lyrics don't follow the playback position.
export const LyricsOverlay = React.memo(function LyricsOverlay({
  language,
  stanzas,
}: {
  language: LyricsLanguage;
  stanzas: string[][];
}) {
  // Hindi lyrics need the Devanagari face even when the app is in English.
  const fontFamily = language === "hi" ? fonts.hi : fonts.en;
  return (
    <View style={StyleSheet.absoluteFill} testID="player-lyrics">
      <ScrollView
        testID="player-lyrics-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {stanzas.map((lines, index) => (
          <Txt
            key={index}
            size={LYRIC_SIZE}
            style={[styles.stanza, { fontFamily }]}
          >
            {lines.join("\n")}
          </Txt>
        ))}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[EDGE, EDGE, CLEAR]}
        locations={[0, 0.5, 1]}
        style={[styles.fade, styles.fadeTop]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[CLEAR, EDGE]}
        style={[styles.fade, styles.fadeBottom]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: TOP_PADDING,
    paddingBottom: 36,
    paddingHorizontal: 18,
    gap: 22,
  },
  stanza: {
    color: sanctum.text,
    textAlign: "center",
    lineHeight: LYRIC_LINE,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  fade: { position: "absolute", left: 0, right: 0 },
  // Behind the corner buttons, down to where the text first shows.
  fadeTop: { top: 0, height: TOP_PADDING - 8 },
  fadeBottom: { bottom: 0, height: FADE },
});
