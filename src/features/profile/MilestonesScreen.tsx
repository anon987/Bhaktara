import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Page, Txt } from "../../components/ui";
import { backgrounds } from "../../components/backgrounds";
import { colors, radii, sanctum } from "../../theme/tokens";
import { useOptionalProgression } from "../sadhana/ProgressionProvider";
import { earnedCount, groupMilestones, Milestone } from "./milestones";
import { Medallion } from "./ProfileParts";

type Props = NativeStackScreenProps<RootParams, "Milestones">;

// Every milestone as a 3D medallion, grouped by practice: earned ones bright
// with their date, the rest quiet with how far along the devotee is.
export function MilestonesScreen({ navigation }: Props) {
  const { t } = useApp();
  const progression = useOptionalProgression();
  const snapshot = progression?.snapshot ?? null;
  const status = progression?.status ?? "off";
  const refresh = progression?.refresh;
  // Fresh dates and counts each time the screen opens.
  useEffect(() => {
    void refresh?.();
  }, [refresh]);
  const badges = snapshot?.badges ?? [];
  const groups = snapshot
    ? groupMilestones(badges, {
        counters: snapshot.counters,
        longestStreak: snapshot.longestStreak,
        totalXp: snapshot.totalXp,
      })
    : [];
  return (
    <Page
      background={backgrounds.profile}
      title={t("milestonesTitle")}
      subtitle={
        badges.length
          ? `${earnedCount(badges)} / ${badges.length} ${t("milestonesEarned")}`
          : undefined
      }
      onBack={navigation.goBack}
    >
      {!snapshot &&
        (status === "loading" ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
            <Txt muted>{t("loading")}</Txt>
          </View>
        ) : (
          <Card style={styles.state}>
            <Txt bold size={18} style={{ textAlign: "center" }}>
              {t("milestonesOffline")}
            </Txt>
            {refresh && (
              <Button label={t("retry")} onPress={() => void refresh()} />
            )}
          </Card>
        ))}
      {groups.map((group) => (
        <View key={group.id} style={{ gap: 12 }}>
          <Txt bold size={22} accessibilityRole="header">
            {t(group.label)}
          </Txt>
          <View style={styles.grid}>
            {group.items.map((item) => (
              <MilestoneTile key={item.badge.id} item={item} />
            ))}
          </View>
        </View>
      ))}
      {snapshot && (
        <Txt muted size={14} style={{ textAlign: "center" }}>
          {t("rankInfo")}
        </Txt>
      )}
    </Page>
  );
}

function MilestoneTile({ item }: { item: Milestone }) {
  const { t, local } = useApp();
  const { badge, progress } = item;
  const date =
    badge.unlocked && badge.unlockedAt
      ? badge.unlockedAt.toLocaleDateString(
          local.language === "hi" ? "hi-IN" : "en-IN",
          { day: "numeric", month: "long", year: "numeric" },
        )
      : null;
  const status = badge.unlocked
    ? date
      ? `${t("earnedOn")} ${date}`
      : t("earned")
    : progress
      ? `${progress.current} / ${progress.target} ${t(progress.unit)}`
      : t("comingSoon");
  return (
    <View
      testID={`milestone-${badge.id}`}
      accessible
      accessibilityLabel={`${badge.name[local.language]}. ${badge.description[local.language]}. ${status}`}
      style={[styles.tile, badge.unlocked && styles.tileEarned]}
    >
      <Medallion iconKey={badge.iconKey} earned={badge.unlocked} size={92} />
      <Txt
        bold
        size={17}
        style={{
          textAlign: "center",
          color: badge.unlocked ? colors.ink : colors.muted,
        }}
      >
        {badge.name[local.language]}
      </Txt>
      {!badge.unlocked && progress && (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${(progress.current / progress.target) * 100}%` },
            ]}
          />
        </View>
      )}
      <Txt
        bold={badge.unlocked}
        size={14}
        style={{
          textAlign: "center",
          color: badge.unlocked ? colors.green : colors.muted,
        }}
      >
        {status}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { padding: 30, gap: 18, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: "rgba(255, 251, 243, 0.82)",
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileEarned: {
    backgroundColor: colors.surface,
    borderColor: sanctum.brass,
    borderWidth: 1.5,
  },
  track: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.saffron },
});
