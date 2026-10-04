import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  Check,
  ChevronRight,
  CircleDot,
  Flower2,
  HeartHandshake,
  LockKeyhole,
  Timer,
  Trophy,
} from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  Chip,
  DataBoundary,
  Notice,
  Page,
  Progress,
  Row,
  Section,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { colors } from "../../theme/tokens";
import { localPracticeDay } from "../../domain/practice";
import { StringKey } from "../../i18n/strings";
import { authService } from "../../services/integrations";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Sadhana">,
  NativeStackScreenProps<RootParams>
>;
export function SadhanaScreen({ navigation }: Props) {
  const { t, local, catalog } = useApp();
  const unavailable = useUnavailable();
  const [section, setSection] = useState<
    "today" | "challenges" | "league" | "history"
  >("today");
  const tasks = local.days[localPracticeDay()];
  const done = Object.values(tasks ?? {}).filter(Boolean).length;
  const league = (
    <Card
      style={{
        backgroundColor: colors.dark,
        borderColor: colors.dark,
        padding: 26,
      }}
    >
      <Trophy color="#D8B574" size={38} />
      <Txt bold size={23} style={{ color: colors.white }}>
        {t("joinLeague")}
      </Txt>
      <Txt style={{ color: "#E2D3C7" }}>{t("leagueHint")}</Txt>
      <Row>
        <LockKeyhole size={17} color="#D8B574" />
        <Txt size={12} style={{ color: "#E2D3C7" }}>
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
      <Txt size={11} style={{ color: "#D8C9BA" }}>
        {t("leaguePreview")}
      </Txt>
    </Card>
  );
  return (
    <Page title={t("sadhana")} subtitle={t("dailyHint")}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {(["today", "challenges", "league", "history"] as const).map((key) => (
          <Chip
            key={key}
            label={t(key)}
            selected={section === key}
            onPress={() => setSection(key)}
          />
        ))}
      </ScrollView>
      <DataBoundary>
        {section === "today" && (
          <>
            <Card style={{ backgroundColor: colors.greenPale }}>
              <Row>
                <Flower2 size={35} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Txt bold size={22}>
                    {t("practice")}
                  </Txt>
                  <Txt muted size={13}>
                    {done}/3 {t("tasks")}
                  </Txt>
                </View>
              </Row>
              <Progress value={done / 3} label={t("daily")} />
            </Card>
            {[
              { key: "jaap", hint: "jaapHint", route: "Jaap", icon: CircleDot },
              {
                key: "meditation",
                hint: "meditationHint",
                route: "Meditation",
                icon: Timer,
              },
              {
                key: "prayer",
                hint: "prayerHint",
                route: "Prayer",
                icon: HeartHandshake,
              },
            ].map(({ key, hint, route, icon: Icon }) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => navigation.navigate(route as "Jaap")}
              >
                <Card>
                  <Row>
                    <View
                      style={{
                        padding: 13,
                        backgroundColor: colors.pale,
                        borderRadius: 17,
                      }}
                    >
                      <Icon color={colors.primary} size={25} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt bold size={18}>
                        {t(key as StringKey)}
                      </Txt>
                      <Txt muted size={12}>
                        {tasks?.[key as "jaap"]
                          ? t("completed")
                          : t(hint as StringKey)}
                      </Txt>
                    </View>
                    {tasks?.[key as "jaap"] ? (
                      <Check color={colors.green} size={23} />
                    ) : (
                      <ChevronRight size={21} color={colors.muted} />
                    )}
                  </Row>
                </Card>
              </Pressable>
            ))}
            <Section title={t("league")} />
            {league}
          </>
        )}
        {section === "challenges" && (
          <>
            <Txt muted>{t("challengeHint")}</Txt>
            {catalog?.challenges.map((item) => (
              <Card key={item.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt size={12} bold style={{ color: colors.primary }}>
                    {item.period === "DAILY" ? t("today") : t("challenges")}
                  </Txt>
                  <Txt bold style={{ color: colors.primary }}>
                    +{item.xpReward} XP
                  </Txt>
                </Row>
                <Txt bold size={23}>
                  {item.title[local.language]}
                </Txt>
                <Progress
                  value={item.progress / item.target}
                  label={item.title[local.language]}
                />
                <Txt muted size={13}>
                  {item.progress}/{item.target}
                </Txt>
                <Txt muted size={11}>
                  {t("sampleChallenge")}
                </Txt>
              </Card>
            ))}
          </>
        )}
        {section === "league" && league}
        {section === "history" && (
          <>
            <Txt muted>{t("historyHint")}</Txt>
            {Object.entries(local.days)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([day, record]) => (
                <Card key={day}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt bold>{day}</Txt>
                    <Txt>
                      {Object.values(record).filter(Boolean).length}/3{" "}
                      {t("tasks")}
                    </Txt>
                  </Row>
                </Card>
              ))}
          </>
        )}
        <Notice text={t("localOnly")} />
      </DataBoundary>
    </Page>
  );
}
