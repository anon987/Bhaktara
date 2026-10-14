import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { DataBoundary, Notice, Page, Txt } from "../../components/ui";
import { backgrounds } from "../../components/backgrounds";
import { useReducedMotion } from "../../components/useReducedMotion";
import { colors } from "../../theme/tokens";
import { useProgression } from "./ProgressionProvider";
import { Kalash } from "./art/Kalash";
import { Toran } from "./art/Toran";
import {
  HistoryStats,
  LampCalendar,
  LeagueSection,
  Milestones,
  SankalpCard,
  SectionKey,
  SectionSwitcher,
  StreakHero,
  TodayLamps,
} from "./SadhanaParts";
import { usePrefetchMandirDecor } from "../mandir/decor/useMandirDecor";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Sadhana">,
  NativeStackScreenProps<RootParams>
>;

export function SadhanaScreen({ navigation }: Props) {
  const { t, catalog, local } = useApp();
  // Download the mandir's temples and murti ahead, so the Mandir opens on
  // them instead of waiting.
  const deities = catalog?.deities ?? [];
  usePrefetchMandirDecor(
    deities.find((item) => item.id === local.deityId) ?? deities[0],
  );
  const { status, snapshot } = useProgression();
  const reduced = useReducedMotion();
  const [section, setSection] = useState<SectionKey>("today");
  const earningNote =
    status === "off"
      ? t("deviceOnly")
      : status === "offline"
        ? t("earnOnline")
        : null;
  return (
    <Page
      background={backgrounds.sadhana}
      title={t("sadhana")}
      subtitle={t("dailyHint")}
    >
      {/* A bandhanwar over the doorway of the day's practice. */}
      <View style={styles.toran}>
        <Toran height={44} />
      </View>
      <SectionSwitcher value={section} onChange={setSection} />
      <DataBoundary>
        {/* Each section fades in when chosen (an entering animation: animated
            styles would snap back on re-render). */}
        <Animated.View
          key={section}
          entering={reduced ? undefined : FadeIn.duration(220)}
          style={styles.section}
        >
          {section === "today" && (
            <>
              <StreakHero />
              {/* The day's puja opens the Mandir tab. */}
              <TodayLamps onOpen={(route) => navigation.navigate(route)} />
            </>
          )}
          {section === "challenges" && (
            <>
              <View style={styles.intro}>
                <Kalash size={40} />
                <Txt size={17} style={{ flex: 1, color: colors.ink }}>
                  {t("sankalpHint")}
                </Txt>
              </View>
              {!snapshot ? (
                <Notice text={t("sankalpOffline")} />
              ) : snapshot.challenges.length === 0 ? (
                <Notice text={t("noSankalp")} />
              ) : (
                snapshot.challenges.map((challenge) => (
                  <SankalpCard key={challenge.id} challenge={challenge} />
                ))
              )}
            </>
          )}
          {section === "league" && (
            <LeagueSection
              onGoToday={() => setSection("today")}
              onAddPhoto={() => navigation.navigate("EditProfile")}
            />
          )}
          {section === "history" && (
            <>
              <LampCalendar />
              {snapshot && (
                <HistoryStats
                  malas={snapshot.counters.malas}
                  minutes={snapshot.counters.meditationMinutes}
                  longestStreak={snapshot.longestStreak}
                />
              )}
              {snapshot && snapshot.badges.length > 0 && (
                <>
                  <Txt bold size={21}>
                    {t("milestones")}
                  </Txt>
                  <Milestones badges={snapshot.badges} />
                  <Txt muted size={16}>
                    {t("rankInfo")}
                  </Txt>
                </>
              )}
            </>
          )}
        </Animated.View>
        {earningNote && <Notice text={earningNote} />}
      </DataBoundary>
    </Page>
  );
}

const styles = StyleSheet.create({
  // The page pads its content; the toran spans the full width.
  toran: { marginHorizontal: -22, marginBottom: -10 },
  section: { gap: 20 },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
});
