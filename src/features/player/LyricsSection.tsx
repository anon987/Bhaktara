import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Txt } from "../../components/ui";
import { lyricsForLanguage } from "../../domain/lyrics";
import type { Content } from "../../domain/models";
import { fonts, shrine } from "../../theme/tokens";
import { Marigold } from "../sadhana/art/Marigold";

const LYRIC_SIZE = 20;

// The song's lyrics under the player controls, in the app language (or the
// other one when that is empty), on a parchment page in a gold frame.
// Section notes such as "[Chorus — Mukhda]" are hidden. It scrolls with the
// player page; there is no inner scroll view. Memoised: the lyrics don't
// follow the playback position.
export const LyricsSection = React.memo(function LyricsSection({
  lyrics,
}: {
  lyrics: Content["lyrics"];
}) {
  const { local, t } = useApp();
  const shown = lyricsForLanguage(lyrics, local.language);
  if (!shown) return null;
  // Hindi lyrics need the Devanagari face even when the app is in English.
  const fontFamily = shown.language === "hi" ? fonts.hi : fonts.en;
  return (
    <View style={styles.frame} testID="player-lyrics">
      <View style={styles.panel}>
        <View style={styles.heading}>
          <Marigold size={22} />
          <View style={styles.rule} />
          <Txt bold size={22} accessibilityRole="header" style={styles.title}>
            {t("lyrics")}
          </Txt>
          <View style={styles.rule} />
          <Marigold size={22} />
        </View>
        {shown.stanzas.map((lines, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <View style={styles.divider} accessible={false}>
                <View style={styles.diamondSmall} />
                <View style={styles.diamond} />
                <View style={styles.diamondSmall} />
              </View>
            )}
            <Txt size={LYRIC_SIZE} style={[styles.stanza, { fontFamily }]}>
              {lines.join("\n")}
            </Txt>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // A double gold border: the outer frame and a thin inner line.
  frame: {
    marginTop: 24,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: shrine.gold,
    backgroundColor: shrine.parchment,
    padding: 5,
  },
  panel: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: shrine.line,
    backgroundColor: shrine.ivory,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
    gap: 18,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  rule: { flex: 1, height: 1.5, backgroundColor: shrine.gold },
  title: { color: shrine.maroon },
  stanza: {
    color: shrine.ink,
    textAlign: "center",
    lineHeight: Math.round(LYRIC_SIZE * 1.65),
  },
  divider: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
  },
  diamond: {
    width: 8,
    height: 8,
    backgroundColor: shrine.saffronDeep,
    transform: [{ rotate: "45deg" }],
  },
  diamondSmall: {
    width: 5,
    height: 5,
    backgroundColor: shrine.gold,
    transform: [{ rotate: "45deg" }],
  },
});
