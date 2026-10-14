import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { lyricsForLanguage } from "../../domain/lyrics";
import type { Content } from "../../domain/models";
import { colors, fonts, radii } from "../../theme/tokens";

const LYRIC_SIZE = 19;

// The song's lyrics under the player controls, in the app language (or the
// other one when that is empty). Section notes such as "[Chorus — Mukhda]"
// are hidden. It scrolls with the player page; there is no inner scroll view.
export function LyricsSection({ lyrics }: { lyrics: Content["lyrics"] }) {
  const { local, t } = useApp();
  const shown = lyricsForLanguage(lyrics, local.language);
  if (!shown) return null;
  // Hindi lyrics need the Devanagari face even when the app is in English.
  const fontFamily = shown.language === "hi" ? fonts.hi : fonts.en;
  return (
    <View style={styles.panel} testID="player-lyrics">
      <View style={styles.heading}>
        <View style={styles.rule} />
        <Txt bold size={20} accessibilityRole="header" style={styles.title}>
          {t("lyrics")}
        </Txt>
        <View style={styles.rule} />
      </View>
      {shown.stanzas.map((lines, index) => (
        <React.Fragment key={index}>
          {index > 0 && <View style={styles.diamond} accessible={false} />}
          <Txt size={LYRIC_SIZE} style={[styles.stanza, { fontFamily }]}>
            {lines.join("\n")}
          </Txt>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.gold,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 18,
    marginTop: 8,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  rule: { flex: 1, height: 1.5, backgroundColor: colors.gold },
  title: { color: colors.maroon },
  stanza: {
    color: colors.ink,
    textAlign: "center",
    lineHeight: Math.round(LYRIC_SIZE * 1.6),
  },
  diamond: {
    alignSelf: "center",
    width: 7,
    height: 7,
    backgroundColor: colors.saffron,
    transform: [{ rotate: "45deg" }],
  },
});
