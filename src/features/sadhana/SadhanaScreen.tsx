import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LockKeyhole, Trophy } from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  DataBoundary,
  Notice,
  Page,
  Row,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { backgrounds } from "../../components/backgrounds";
import { colors } from "../../theme/tokens";
import { StringKey } from "../../i18n/strings";
import { authService } from "../../services/integrations";
import { useProgression } from "./ProgressionProvider";
import {
  LampCalendar,
  Milestones,
  SankalpCard,
  StreakHero,
  TodayLamps,
} from "./SadhanaParts";
import { usePrefetchMandirDecor } from "./decor/useMandirDecor";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Sadhana">,
  NativeStackScreenProps<RootParams>
>;
type SectionKey = "today" | "challenges" | "league" | "history";
const sections: SectionKey[] = ["today", "challenges", "league", "history"];

export function SadhanaScreen({ navigation }: Props) {
  const { t, catalog, local } = useApp();
  // Download the mandir's temples and murti ahead, so the Prayer screen opens
  // on them instead of waiting.
  const deities = catalog?.deities ?? [];
  usePrefetchMandirDecor(
    deities.find((item) => item.id === local.deityId) ?? deities[0],
  );
  const { status, snapshot } = useProgression();
  const unavailable = useUnavailable();
  const [section, setSection] = useState<SectionKey>("today");
  const earningNote =
    status === "off"
      ? t("deviceOnly")
      : status === "offline"
        ? t("earnOnline")
        : null;
  const league = (
    <Card style={styles.league}>
      <Trophy color="#D8B574" size={38} />
      <Txt bold size={23} style={{ color: colors.white }}>
        {t("joinLeague")}
      </Txt>
      <Txt style={{ color: "#E2D3C7" }}>{t("leagueHint")}</Txt>
      <Row>
        <LockKeyhole size={17} color="#D8B574" />
        <Txt size={13} style={{ color: "#E2D3C7" }}>
          {t("bronze")}
        </Txt>
      </Row>
      <Button
        label={t("signIn")}
        onPress={() => {
          void authService.signIn();
          unavailable("authUnavailable");
        }}
      />
      <Txt size={12} style={{ color: "#D8C9BA" }}>
        {t("leaguePreview")}
      </Txt>
    </Card>
  );
  return (
    <Page
      background={backgrounds.sadhana}
      title={t("sadhana")}
      subtitle={t("dailyHint")}
    >
      <View style={styles.tabs} accessibilityRole="tablist">
        {sections.map((key) => {
          const selected = section === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setSection(key)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Txt
                bold
                size={15}
                style={{ color: selected ? colors.white : colors.ink }}
              >
                {t(key === "challenges" ? "sankalpTitle" : (key as StringKey))}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <DataBoundary>
        {section === "today" && (
          <>
            <StreakHero />
            <TodayLamps onOpen={(route) => navigation.navigate(route)} />
          </>
        )}
        {section === "challenges" && (
          <>
            <Txt muted size={16}>
              {t("sankalpHint")}
            </Txt>
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
        {section === "league" && league}
        {section === "history" && (
          <>
            <LampCalendar />
            {snapshot && (
              <View style={styles.totals}>
                {(
                  [
                    ["totalMalas", snapshot.counters.malas],
                    ["totalMinutes", snapshot.counters.meditationMinutes],
                    ["longestStreak", snapshot.longestStreak],
                  ] as [StringKey, number][]
                ).map(([label, value]) => (
                  <View key={label} style={styles.total}>
                    <Txt bold size={28} style={{ color: colors.primary }}>
                      {value}
                    </Txt>
                    <Txt muted size={13} style={{ textAlign: "center" }}>
                      {t(label)}
                    </Txt>
                  </View>
                ))}
              </View>
            )}
            {snapshot && snapshot.badges.length > 0 && (
              <>
                <Txt bold size={20}>
                  {t("milestones")}
                </Txt>
                <Milestones badges={snapshot.badges} />
                <Txt muted size={13}>
                  {t("rankInfo")}
                </Txt>
              </>
            )}
          </>
        )}
        {earningNote && <Notice text={earningNote} />}
      </DataBoundary>
    </Page>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  league: {
    backgroundColor: colors.dark,
    borderColor: colors.dark,
    padding: 26,
  },
  totals: { flexDirection: "row", gap: 10 },
  total: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
