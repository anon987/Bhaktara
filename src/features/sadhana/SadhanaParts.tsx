import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Award,
  CircleDot,
  Crown,
  Flag,
  Flame,
  Flower2,
  LucideIcon,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  TrendingUp,
} from "lucide-react-native";
import { Txt } from "../../components/ui";
import { useApp } from "../../app/providers/AppProvider";
import { addDays, rankNames, SadhanaTask } from "../../domain/progression";
import {
  BadgeView,
  ChallengeView,
} from "../../repositories/progressionRepository";
import { StringKey } from "../../i18n/strings";
import { colors, sanctum } from "../../theme/tokens";
import { Diya } from "./art/Diya";
import { GarlandProgress } from "./art/GarlandProgress";
import { MiniLamp } from "./art/MiniLamp";
import { useOptionalProgression, useProgression } from "./ProgressionProvider";

// Real progress when the server has answered; the catalog's sample values
// (marked as samples by callers) otherwise.
export function useStats() {
  const { catalog } = useApp();
  const progression = useOptionalProgression();
  const snapshot = progression?.snapshot;
  const status = progression?.status ?? "off";
  if (snapshot)
    return {
      real: true,
      totalXp: snapshot.totalXp,
      level: snapshot.level,
      rank: snapshot.rank,
      currentStreak: snapshot.currentStreak,
      longestStreak: snapshot.longestStreak,
      status,
    };
  return {
    real: false,
    totalXp: catalog?.sampleStats.totalXp ?? 0,
    level: catalog?.sampleStats.level ?? 1,
    rank: "JIGYASU" as const,
    currentStreak: catalog?.sampleStats.currentStreak ?? 0,
    longestStreak: 0,
    status,
  };
}

// Akhand jyoti: the streak as a lamp whose glow grows with the days.
export function StreakHero() {
  const { t, local } = useApp();
  const { snapshot } = useProgression();
  const stats = useStats();
  const streak = stats.real ? stats.currentStreak : 0;
  return (
    <LinearGradient
      colors={[sanctum.maroon, sanctum.night]}
      style={styles.hero}
    >
      <View style={styles.heroRow}>
        <Diya size={110} lit={streak > 0} glow={Math.min(1, streak / 21)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt size={15} style={{ color: sanctum.textMuted }}>
            {t("akhandJyoti")}
          </Txt>
          {streak > 0 ? (
            <>
              <Txt
                bold
                size={40}
                style={{ color: sanctum.brassLight, lineHeight: 52 }}
              >
                {streak}
              </Txt>
              <Txt bold size={18} style={{ color: sanctum.text }}>
                {t("streakDays")}
              </Txt>
            </>
          ) : (
            <Txt bold size={19} style={{ color: sanctum.text }}>
              {t("streakStart")}
            </Txt>
          )}
          {stats.longestStreak > 0 && (
            <Txt size={14} style={{ color: sanctum.textMuted }}>
              {t("streakLongest")}: {stats.longestStreak} {t("daysUnit")}
            </Txt>
          )}
        </View>
      </View>
      {snapshot && (
        <View style={{ gap: 6 }}>
          <View style={styles.levelRow}>
            <Txt bold size={17} style={{ color: sanctum.text }}>
              {t("level")} {snapshot.level} ·{" "}
              {rankNames[snapshot.rank][local.language]}
            </Txt>
            <Txt bold size={17} style={{ color: sanctum.brassLight }}>
              {snapshot.totalXp} {t("points")}
            </Txt>
          </View>
          <GarlandProgress value={snapshot.levelFraction} flowers={12} />
          <Txt size={14} style={{ color: sanctum.textMuted }}>
            {snapshot.xpToNextLevel} {t("points")} {t("toNextLevel")} ·{" "}
            {t("pointsToday")}: {snapshot.today.xp}
          </Txt>
        </View>
      )}
    </LinearGradient>
  );
}

const lamps: {
  task: SadhanaTask;
  label: StringKey;
  route: "Jaap" | "Meditation" | "Mandir";
}[] = [
  { task: "jaap", label: "jaapShort", route: "Jaap" },
  { task: "meditation", label: "dhyanShort", route: "Meditation" },
  // The puja is performed in the Mandir tab.
  { task: "prayer", label: "pujaInMandir", route: "Mandir" },
];

// Today's three practices as three lamps on a brass tray.
export function TodayLamps({
  onOpen,
}: {
  onOpen: (route: "Jaap" | "Meditation" | "Mandir") => void;
}) {
  const { t, local } = useApp();
  const { snapshot, status, today } = useProgression();
  const day = today();
  const tasks =
    status === "ready" && snapshot
      ? snapshot.today.tasks
      : (local.days[day] ?? { jaap: false, meditation: false, prayer: false });
  const full = lamps.every(({ task }) => tasks[task]);
  return (
    <View style={styles.tray}>
      <Txt bold size={20} style={{ color: colors.ink }}>
        {t("threeLamps")}
      </Txt>
      <View style={styles.lamps}>
        {lamps.map(({ task, label, route }) => {
          const done = tasks[task];
          return (
            <Pressable
              key={task}
              accessibilityRole="button"
              accessibilityLabel={`${t(label)}, ${done ? t("taskDone") : t("taskBegin")}`}
              onPress={() => onOpen(route)}
              style={({ pressed }) => [
                styles.lamp,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Diya size={78} lit={done} glow={0.4} />
              {/* "मंदिर में पूजा" may take two lines; the pills stay level. */}
              <Txt
                bold
                size={19}
                textBreakStrategy="simple"
                style={{ flexGrow: 1, width: "100%", textAlign: "center" }}
              >
                {t(label)}
              </Txt>
              <View style={[styles.pill, done && styles.pillDone]}>
                <Txt
                  bold
                  size={14}
                  textBreakStrategy="simple"
                  style={{
                    color: done ? colors.white : colors.primary,
                    textAlign: "center",
                    // Full width: Android under-measures bold Devanagari and
                    // drops the last word when the text sizes itself.
                    width: "100%",
                  }}
                >
                  {done ? `${t("taskDone")} ✓` : t("taskBegin")}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      {full && (
        <View style={styles.full}>
          <Flower2 size={22} color={sanctum.marigoldDeep} />
          <Txt bold size={16} style={{ flex: 1, color: colors.ink }}>
            {t("fullSadhanaToday")}
          </Txt>
        </View>
      )}
    </View>
  );
}

export function SankalpCard({ challenge }: { challenge: ChallengeView }) {
  const { t, local } = useApp();
  const done = challenge.status === "COMPLETED";
  return (
    <View style={[styles.sankalp, done && { borderColor: colors.green }]}>
      <View style={styles.levelRow}>
        <Txt bold size={14} style={{ color: colors.primary }}>
          {challenge.period === "DAILY" ? t("today") : t("untilMonday")}
          {challenge.period === "DAILY" ? ` · ${t("untilTonight")}` : ""}
        </Txt>
        <Txt bold size={15} style={{ color: sanctum.brassDeep }}>
          +{challenge.xpReward} {t("points")}
        </Txt>
      </View>
      <Txt bold size={21}>
        {challenge.title[local.language]}
      </Txt>
      <Txt muted size={15}>
        {challenge.description[local.language]}
      </Txt>
      <GarlandProgress
        value={challenge.progress / challenge.target}
        flowers={Math.min(10, challenge.target)}
      />
      <Txt bold size={16} style={{ color: done ? colors.green : colors.ink }}>
        {done
          ? `${t("sankalpDone")} ✓`
          : `${challenge.progress} / ${challenge.target}`}
      </Txt>
    </View>
  );
}

const weekdays = {
  hi: ["सो", "मं", "बु", "गु", "शु", "श", "र"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
};

// The last five weeks as lamps: lit for a practice day, garlanded for a
// full Sadhana day, unlit clay for a rest day. Never "missed".
export function LampCalendar() {
  const { t, local } = useApp();
  const { snapshot, today } = useProgression();
  const day = today();
  const [year, month, date] = day.split("-").map(Number);
  const weekday =
    (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  const start = addDays(day, -(28 + weekday));
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const server = new Map(
    snapshot?.days.map((entry) => [entry.day, entry.record]),
  );
  const stateOf = (key: string): "rest" | "lit" | "full" => {
    const record = server.get(key);
    if (record)
      return record.fullSadhana ? "full" : record.qualifying ? "lit" : "rest";
    const localDay = local.days[key];
    if (!snapshot && localDay) {
      const count = Object.values(localDay).filter(Boolean).length;
      return count === 3 ? "full" : count > 0 ? "lit" : "rest";
    }
    return "rest";
  };
  return (
    <View style={styles.tray}>
      <Txt bold size={20}>
        {t("sadhanaCalendar")}
      </Txt>
      <View style={styles.calendar}>
        {weekdays[local.language].map((name, i) => (
          <Txt key={`h${i}`} muted bold size={13} style={styles.cell}>
            {name}
          </Txt>
        ))}
        {cells.map((key) => (
          <View
            key={key}
            style={[styles.cell, key === day && styles.todayCell]}
            accessibilityLabel={`${key}: ${t(
              stateOf(key) === "full"
                ? "legendFull"
                : stateOf(key) === "lit"
                  ? "legendLit"
                  : "legendRest",
            )}`}
          >
            {key <= day ? (
              <MiniLamp size={36} state={stateOf(key)} />
            ) : (
              <View style={{ width: 36, height: 36 }} />
            )}
            <Txt muted size={11}>
              {Number(key.slice(8))}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {(["lit", "full", "rest"] as const).map((state) => (
          <View key={state} style={styles.legendItem}>
            <MiniLamp size={26} state={state} />
            <Txt size={13}>
              {t(
                state === "lit"
                  ? "legendLit"
                  : state === "full"
                    ? "legendFull"
                    : "legendRest",
              )}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const badgeIcons: Record<string, LucideIcon> = {
  lotus: Flower2,
  diya: Flame,
  sun: Sun,
  mala: CircleDot,
  om: Sparkles,
  sunrise: Sunrise,
  temple: Award,
  flag: Flag,
  arrow: TrendingUp,
  crown: Crown,
  star: Star,
};

// Milestones as brass medallions; locked ones wait quietly.
export function Milestones({ badges }: { badges: BadgeView[] }) {
  const { t, local } = useApp();
  return (
    <View style={styles.medals}>
      {badges.map((badge) => {
        const Icon = badgeIcons[badge.iconKey] ?? Award;
        return (
          <View
            key={badge.id}
            style={[styles.medal, !badge.unlocked && { opacity: 0.45 }]}
            accessibilityLabel={`${badge.name[local.language]}: ${
              badge.unlocked ? badge.description[local.language] : t("notYet")
            }`}
          >
            <View
              style={[styles.medalCircle, badge.unlocked && styles.medalLit]}
            >
              <Icon
                size={28}
                color={badge.unlocked ? sanctum.night : colors.muted}
              />
            </View>
            <Txt bold size={13} style={{ textAlign: "center" }}>
              {badge.name[local.language]}
            </Txt>
            {!badge.unlocked && (
              <Txt muted size={11}>
                {t("notYet")}
              </Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 30, padding: 20, gap: 16 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  tray: {
    gap: 14,
    padding: 18,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: "#E4C98F",
  },
  lamps: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  lamp: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 4,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "#FBF0DC",
  },
  pill: {
    minHeight: 34,
    alignSelf: "stretch",
    marginHorizontal: 6,
    alignItems: "center",
    paddingHorizontal: 4,
    borderRadius: 17,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pillDone: { backgroundColor: colors.green, borderColor: colors.green },
  full: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#FDEBC8",
  },
  sankalp: {
    gap: 8,
    padding: 18,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: "#E4C98F",
  },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    textAlign: "center",
    paddingVertical: 2,
    borderRadius: 12,
  },
  todayCell: { backgroundColor: "#FDEBC8" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  medals: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  medal: { width: "30%", alignItems: "center", gap: 4, paddingVertical: 6 },
  medalCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pale,
    borderWidth: 2,
    borderColor: colors.line,
  },
  medalLit: { backgroundColor: sanctum.brass, borderColor: sanctum.brassLight },
});
