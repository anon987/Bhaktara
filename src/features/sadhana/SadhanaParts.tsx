import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Flower2,
  Hourglass,
  LogIn,
  Sparkles,
  Trophy,
} from "lucide-react-native";
import { Button, Txt, useUnavailable } from "../../components/ui";
import { useApp } from "../../app/providers/AppProvider";
import {
  addDays,
  rankNames,
  SadhanaTask,
  weekEndsAt,
} from "../../domain/progression";
import {
  BadgeView,
  ChallengeView,
} from "../../repositories/progressionRepository";
import { StringKey } from "../../i18n/strings";
import { colors, sanctum } from "../../theme/tokens";
import { Diya } from "./art/Diya";
import { GarlandProgress } from "./art/GarlandProgress";
import { Kalash, MalaBeads } from "./art/Kalash";
import { Marigold } from "./art/Marigold";
import { MiniLamp } from "./art/MiniLamp";
import { useOptionalProgression, useProgression } from "./ProgressionProvider";
import { Avatar, Medallion } from "../profile/ProfileParts";
import { useAccount } from "../profile/AccountProvider";
import { useAccountActions } from "../profile/useAccountActions";

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

// ---- Section switcher -------------------------------------------------------

export type SectionKey = "today" | "challenges" | "league" | "history";
const sectionTabs: { key: SectionKey; label: StringKey }[] = [
  { key: "today", label: "today" },
  { key: "challenges", label: "tabSankalp" },
  { key: "league", label: "league" },
  { key: "history", label: "history" },
];

function SectionIcon({
  section,
  selected,
}: {
  section: SectionKey;
  selected: boolean;
}) {
  const tint = selected ? colors.maroon : sanctum.brassLight;
  switch (section) {
    case "today":
      return <MiniLamp size={30} state="lit" />;
    case "challenges":
      return <Kalash size={30} />;
    case "league":
      return <Trophy size={26} color={tint} strokeWidth={2.2} />;
    case "history":
      return <CalendarDays size={26} color={tint} strokeWidth={2.2} />;
  }
}

// Four sections on one brass-rimmed bar: always one line, icon over a short
// label, the chosen one lit in gold.
export function SectionSwitcher({
  value,
  onChange,
}: {
  value: SectionKey;
  onChange: (section: SectionKey) => void;
}) {
  const { t } = useApp();
  return (
    <View style={styles.switcher} accessibilityRole="tablist">
      {sectionTabs.map(({ key, label }) => {
        const selected = value === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={t(label)}
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && { opacity: 0.75 },
            ]}
          >
            <SectionIcon section={key} selected={selected} />
            <Txt
              bold
              size={15}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              textBreakStrategy="simple"
              style={{
                width: "100%",
                textAlign: "center",
                color: selected ? colors.maroon : sanctum.text,
              }}
            >
              {t(label)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Today ------------------------------------------------------------------

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
          <Txt size={16} style={{ color: sanctum.textMuted }}>
            {t("akhandJyoti")}
          </Txt>
          {streak > 0 ? (
            <>
              <Txt
                bold
                size={52}
                style={{ color: sanctum.brassLight, lineHeight: 64 }}
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
            <Txt size={16} style={{ color: sanctum.textMuted }}>
              {t("streakLongest")}: {stats.longestStreak} {t("daysUnit")}
            </Txt>
          )}
        </View>
      </View>
      {snapshot && (
        <View style={styles.levelBand}>
          <View style={styles.levelRow}>
            <Txt bold size={17} style={{ color: sanctum.text, flexShrink: 1 }}>
              {t("level")} {snapshot.level} ·{" "}
              {rankNames[snapshot.rank][local.language]}
            </Txt>
            <Txt bold size={17} style={{ color: sanctum.brassLight }}>
              {snapshot.totalXp} {t("points")}
            </Txt>
          </View>
          <GarlandProgress value={snapshot.levelFraction} flowers={10} />
          <Txt size={16} style={{ color: sanctum.textMuted }}>
            {snapshot.xpToNextLevel} {t("points")} {t("toNextLevel")} ·{" "}
            {t("pointsToday")}: {snapshot.today.xp}
          </Txt>
        </View>
      )}
    </LinearGradient>
  );
}

type PracticeRoute = "Jaap" | "Meditation" | "Mandir";
const lamps: { task: SadhanaTask; label: StringKey; route: PracticeRoute }[] = [
  { task: "jaap", label: "jaapShort", route: "Jaap" },
  { task: "meditation", label: "dhyanShort", route: "Meditation" },
  // The puja is performed in the Mandir tab.
  { task: "prayer", label: "pujaInMandir", route: "Mandir" },
];

// Today's three practices on a brass thali: a checklist of lamps, and one
// big button for the next practice still waiting.
export function TodayLamps({
  onOpen,
}: {
  onOpen: (route: PracticeRoute) => void;
}) {
  const { t, local } = useApp();
  const { snapshot, status, today } = useProgression();
  const day = today();
  const tasks =
    status === "ready" && snapshot
      ? snapshot.today.tasks
      : (local.days[day] ?? { jaap: false, meditation: false, prayer: false });
  const doneCount = lamps.filter(({ task }) => tasks[task]).length;
  const next = lamps.find(({ task }) => !tasks[task]);
  return (
    <View style={styles.thali}>
      <View style={styles.thaliHeader}>
        <Txt bold size={21} style={{ flex: 1, color: colors.ink }}>
          {t("threeLamps")}
        </Txt>
        <View style={styles.countPill}>
          <Txt bold size={16} style={{ color: colors.maroon }}>
            {doneCount} / {lamps.length} {t("tasksDone")}
          </Txt>
        </View>
      </View>
      {lamps.map(({ task, label, route }) => {
        const done = tasks[task];
        return (
          <Pressable
            key={task}
            accessibilityRole="button"
            accessibilityLabel={`${t(label)}, ${done ? t("taskDone") : t("taskBegin")}`}
            onPress={() => onOpen(route)}
            style={({ pressed }) => [
              styles.practice,
              done && styles.practiceDone,
              pressed && { opacity: 0.8 },
            ]}
          >
            <MiniLamp size={48} state={done ? "lit" : "rest"} />
            <Txt bold size={19} style={{ flex: 1 }}>
              {t(label)}
            </Txt>
            {done ? (
              <View style={styles.doneMark}>
                <Check size={22} color={colors.white} strokeWidth={3} />
              </View>
            ) : (
              <View style={styles.beginMark}>
                <Txt bold size={16} style={{ color: colors.primary }}>
                  {t("taskBegin")}
                </Txt>
                <ChevronRight size={20} color={colors.primary} />
              </View>
            )}
          </Pressable>
        );
      })}
      {next ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("nextPractice")}: ${t(next.label)}`}
          onPress={() => onOpen(next.route)}
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[colors.saffron, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextButton}
          >
            <MiniLamp size={44} state="lit" />
            <View style={{ flex: 1 }}>
              <Txt size={16} style={{ color: colors.headerText }}>
                {t("nextPractice")}
              </Txt>
              <Txt bold size={22} style={{ color: colors.white }}>
                {t(next.label)}
              </Txt>
            </View>
            <ChevronRight size={30} color={colors.white} />
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={styles.full}>
          <Marigold size={34} />
          <Txt bold size={17} style={{ flex: 1, color: colors.ink }}>
            {t("fullSadhanaToday")}
          </Txt>
          <Marigold size={34} />
        </View>
      )}
    </View>
  );
}

// ---- Sankalps ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// A sankalp as a kalash with its garland filling flower by flower, the
// reward and the time left.
export function SankalpCard({ challenge }: { challenge: ChallengeView }) {
  const { t, local } = useApp();
  const done = challenge.status === "COMPLETED";
  const ended = challenge.status === "EXPIRED";
  const daily = challenge.period === "DAILY";
  // The time at which the card was shown; the section remounts when chosen.
  const [now] = useState(() => Date.now());
  const daysLeft = Math.max(
    1,
    Math.ceil((weekEndsAt(now).getTime() - now) / DAY_MS),
  );
  const timeLeft = daily
    ? t("untilTonight")
    : daysLeft <= 1
      ? t("lastDay")
      : `${daysLeft} ${t("daysLeft")}`;
  return (
    <View
      style={[
        styles.sankalp,
        done && { borderColor: colors.green, borderLeftColor: colors.green },
        ended && { opacity: 0.7 },
      ]}
    >
      <View style={styles.sankalpHead}>
        <Kalash size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt bold size={15} style={{ color: colors.primary }}>
            {daily ? t("today") : t("sankalpWeek")}
          </Txt>
          <Txt bold size={21}>
            {challenge.title[local.language]}
          </Txt>
        </View>
      </View>
      <Txt muted size={16}>
        {challenge.description[local.language]}
      </Txt>
      <View style={styles.garlandBand}>
        <GarlandProgress
          value={challenge.progress / challenge.target}
          flowers={Math.min(10, challenge.target)}
          height={40}
        />
      </View>
      <View style={styles.sankalpFoot}>
        {done ? (
          <View style={styles.inline}>
            <View style={styles.doneMark}>
              <Check size={20} color={colors.white} strokeWidth={3} />
            </View>
            <Txt bold size={19} style={{ color: colors.green }}>
              {t("sankalpDone")}
            </Txt>
          </View>
        ) : (
          <Txt bold size={26} style={{ color: colors.maroon }}>
            {Math.min(challenge.progress, challenge.target)} /{" "}
            {challenge.target}
          </Txt>
        )}
        <View
          style={styles.rewardPill}
          accessibilityLabel={`${t("sankalpReward")}: +${challenge.xpReward} ${t("points")}`}
        >
          <Sparkles size={18} color={sanctum.brassDeep} />
          <Txt bold size={16} style={{ color: sanctum.brassDeep }}>
            +{challenge.xpReward} {t("points")}
          </Txt>
        </View>
      </View>
      {!done && (
        <View style={styles.inline}>
          <Hourglass size={18} color={colors.muted} />
          <Txt bold size={16} muted>
            {ended ? t("sankalpEnded") : timeLeft}
          </Txt>
        </View>
      )}
    </View>
  );
}

// ---- History ----------------------------------------------------------------

type LampState = "rest" | "lit" | "full";

// How a practice day is shown: the server's record when known, the device's
// own record before the server has answered.
function useLampState() {
  const { local } = useApp();
  const { snapshot } = useProgression();
  const server = new Map(
    snapshot?.days.map((entry) => [entry.day, entry.record]),
  );
  return (key: string): LampState => {
    // Today's record is updated as soon as a practice is credited.
    const record =
      snapshot && key === snapshot.bhaktiDay ? snapshot.today : server.get(key);
    if (record)
      return record.fullSadhana ? "full" : record.qualifying ? "lit" : "rest";
    const localDay = local.days[key];
    if (!snapshot && localDay) {
      const count = Object.values(localDay).filter(Boolean).length;
      return count === 3 ? "full" : count > 0 ? "lit" : "rest";
    }
    return "rest";
  };
}
const legendKey = (state: LampState): StringKey =>
  state === "full"
    ? "legendFull"
    : state === "lit"
      ? "legendLit"
      : "legendRest";

// The Monday of a practice day's week.
function mondayOf(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const weekday =
    (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

const weekdays = {
  hi: ["सो", "मं", "बु", "गु", "शु", "श", "र"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
};

// The last five weeks as lamps: lit for a practice day, garlanded for a
// full Sadhana day, unlit clay for a rest day. Never "missed".
export function LampCalendar() {
  const { t, local } = useApp();
  const { today } = useProgression();
  const stateOf = useLampState();
  const day = today();
  const start = addDays(mondayOf(day), -28);
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  return (
    <View style={styles.thali}>
      <View style={styles.inline}>
        <CalendarDays size={24} color={colors.primary} />
        <Txt bold size={20} style={{ flex: 1 }}>
          {t("sadhanaCalendar")}
        </Txt>
      </View>
      <View style={styles.calendar}>
        {weekdays[local.language].map((name, i) => (
          <Txt key={`h${i}`} muted bold size={14} style={styles.cell}>
            {name}
          </Txt>
        ))}
        {cells.map((key) => (
          <View
            key={key}
            style={[styles.cell, key === day && styles.todayCell]}
            accessibilityLabel={`${key}: ${t(legendKey(stateOf(key)))}`}
          >
            {key <= day ? (
              <MiniLamp size={36} state={stateOf(key)} />
            ) : (
              <View style={{ width: 36, height: 36 }} />
            )}
            <Txt muted size={12}>
              {Number(key.slice(8))}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {(["lit", "full", "rest"] as const).map((state) => (
          <View key={state} style={styles.legendItem}>
            <MiniLamp size={28} state={state} />
            <Txt size={15}>{t(legendKey(state))}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// Lifetime totals as three brass plates with big numbers.
export function HistoryStats({
  malas,
  minutes,
  longestStreak,
}: {
  malas: number;
  minutes: number;
  longestStreak: number;
}) {
  const { t } = useApp();
  const items: { label: StringKey; value: number; icon: React.ReactNode }[] = [
    { label: "totalMalas", value: malas, icon: <MalaBeads size={38} /> },
    {
      label: "totalMinutes",
      value: minutes,
      icon: <Flower2 size={34} color={sanctum.marigoldDeep} />,
    },
    {
      label: "longestStreak",
      value: longestStreak,
      icon: <MiniLamp size={40} state="full" />,
    },
  ];
  return (
    <View style={styles.totals}>
      {items.map(({ label, value, icon }) => (
        <View
          key={label}
          style={styles.total}
          accessible
          accessibilityLabel={`${t(label)}: ${value}`}
        >
          <View style={styles.totalIcon}>{icon}</View>
          <Txt
            bold
            size={30}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: colors.maroon, lineHeight: 40 }}
          >
            {value}
          </Txt>
          <Txt
            size={15}
            textBreakStrategy="simple"
            style={{ width: "100%", textAlign: "center", color: colors.ink }}
          >
            {t(label)}
          </Txt>
        </View>
      ))}
    </View>
  );
}

// Milestones as 3D medallions; locked ones wait quietly.
export function Milestones({ badges }: { badges: BadgeView[] }) {
  const { t, local } = useApp();
  return (
    <View style={styles.medals}>
      {badges.map((badge) => {
        return (
          <View
            key={badge.id}
            style={styles.medal}
            accessibilityLabel={`${badge.name[local.language]}: ${
              badge.unlocked ? badge.description[local.language] : t("notYet")
            }`}
          >
            <Medallion
              iconKey={badge.iconKey}
              earned={badge.unlocked}
              size={64}
            />
            <Txt bold size={14} style={{ textAlign: "center" }}>
              {badge.name[local.language]}
            </Txt>
            {!badge.unlocked && (
              <Txt muted size={13}>
                {t("notYet")}
              </Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---- League -----------------------------------------------------------------

// This week (Monday to Sunday) as seven lamps: the devotee's own
// progress only, never other people's.
function WeekLamps() {
  const { t, local } = useApp();
  const { snapshot, today } = useProgression();
  const stateOf = useLampState();
  const day = today();
  const start = mondayOf(day);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const lit = week.filter(
    (key) => key <= day && stateOf(key) !== "rest",
  ).length;
  const xp = (snapshot?.days ?? [])
    .filter((entry) => entry.day >= start && entry.day <= day)
    .reduce((sum, entry) => sum + entry.record.xp, 0);
  return (
    <View style={styles.thali}>
      <Txt bold size={20}>
        {t("leagueYourWeek")}
      </Txt>
      <View style={styles.week}>
        {week.map((key, i) => (
          <View
            key={key}
            style={[styles.weekDay, key === day && styles.todayCell]}
            accessibilityLabel={`${key}: ${t(legendKey(stateOf(key)))}`}
          >
            <Txt bold muted size={14}>
              {weekdays[local.language][i]}
            </Txt>
            <View style={{ opacity: key > day ? 0.35 : 1 }}>
              <MiniLamp size={36} state={key > day ? "rest" : stateOf(key)} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.weekTotals}>
        <View style={styles.inline}>
          <Txt bold size={30} style={{ color: colors.maroon, lineHeight: 40 }}>
            {lit}
          </Txt>
          <Txt bold size={17}>
            {t("lampsLit")}
          </Txt>
        </View>
        {snapshot && (
          <View style={styles.inline}>
            <Txt
              bold
              size={30}
              style={{ color: sanctum.brassDeep, lineHeight: 40 }}
            >
              {xp}
            </Txt>
            <Txt bold size={17}>
              {t("points")}
            </Txt>
          </View>
        )}
      </View>
    </View>
  );
}

function TierMedal({ size = 60 }: { size?: number }) {
  return (
    <LinearGradient
      colors={["#E3A869", "#B8733A", "#7A4A22"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.tierMedal,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Trophy size={size * 0.5} color="#FFF1DC" strokeWidth={2.2} />
    </LinearGradient>
  );
}

// The league, honestly: there is no league backend yet, so a signed-in
// devotee sees their place and their own week; a guest is asked once to sign
// in with Google.
export function LeagueSection({
  onGoToday,
  onAddPhoto,
}: {
  onGoToday: () => void;
  onAddPhoto: () => void;
}) {
  const { t } = useApp();
  const account = useAccount();
  const { signIn } = useAccountActions({ onAddPhoto });
  const unavailable = useUnavailable();
  const soon = (
    <View style={styles.soon}>
      <Hourglass size={26} color={sanctum.brassLight} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt bold size={19} style={{ color: sanctum.text }}>
          {t("leagueSoonTitle")}
        </Txt>
        <Txt size={16} style={{ color: sanctum.textMuted }}>
          {t("leagueSoonText")}
        </Txt>
      </View>
    </View>
  );
  if (account.isGuest)
    return (
      <>
        <LinearGradient
          colors={[sanctum.maroon, sanctum.night]}
          style={styles.league}
        >
          <View style={styles.inline}>
            <TierMedal size={64} />
            <Txt bold size={23} style={{ flex: 1, color: sanctum.text }}>
              {t("joinLeague")}
            </Txt>
          </View>
          <Txt size={17} style={{ color: sanctum.textMuted }}>
            {t("leagueHint")}
          </Txt>
          {soon}
          <Button
            icon={LogIn}
            label={account.busy === "signIn" ? t("signingIn") : t("signIn")}
            disabled={account.busy !== null}
            onPress={() =>
              account.available ? void signIn() : unavailable("authUnavailable")
            }
            style={styles.leagueButton}
          />
        </LinearGradient>
        <WeekLamps />
      </>
    );
  const name = account.profile.displayName ?? t("devoteeName");
  return (
    <>
      <LinearGradient
        colors={[sanctum.maroon, sanctum.night]}
        style={styles.league}
      >
        <View style={styles.inline}>
          <Avatar
            photoKey={account.profile.photoKey}
            size={64}
            label={`${t("yourPhoto")}: ${name}`}
          />
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            <Txt bold size={22} style={{ color: sanctum.text }}>
              {name}
            </Txt>
            <View style={styles.inPill}>
              <Check size={18} color={colors.white} strokeWidth={3} />
              <Txt bold size={16} style={{ color: colors.white }}>
                {t("leagueYoureIn")}
              </Txt>
            </View>
          </View>
        </View>
        <View style={styles.tierRow}>
          <TierMedal />
          <View style={{ flex: 1 }}>
            <Txt size={16} style={{ color: sanctum.textMuted }}>
              {t("leagueYourTier")}
            </Txt>
            <Txt bold size={24} style={{ color: sanctum.brassLight }}>
              {t("bronze")}
            </Txt>
          </View>
        </View>
        <GarlandProgress value={1} flowers={9} height={26} />
        {soon}
      </LinearGradient>
      <WeekLamps />
      <Button label={t("leagueGoToday")} onPress={onGoToday} />
    </>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Section switcher
  switcher: {
    flexDirection: "row",
    gap: 3,
    padding: 4,
    borderRadius: 24,
    backgroundColor: colors.maroon,
    borderWidth: 2,
    borderColor: sanctum.brass,
  },
  segment: {
    flex: 1,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 19,
  },
  segmentSelected: {
    backgroundColor: sanctum.brassLight,
    borderWidth: 1.5,
    borderColor: colors.haldi,
  },
  // Today
  hero: { borderRadius: 30, padding: 20, gap: 16 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  levelBand: {
    gap: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(217, 164, 65, 0.35)",
  },
  levelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 8,
  },
  thali: {
    gap: 12,
    padding: 16,
    borderRadius: 30,
    backgroundColor: "#FBF0DC",
    borderWidth: 3,
    borderColor: sanctum.brass,
  },
  thaliHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FDE3B0",
    borderWidth: 1,
    borderColor: sanctum.brass,
  },
  practice: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  practiceDone: {
    backgroundColor: colors.greenPale,
    borderColor: colors.green,
  },
  doneMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  beginMark: { flexDirection: "row", alignItems: "center", gap: 2 },
  nextButton: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: sanctum.brassLight,
  },
  full: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "#FDEBC8",
    borderWidth: 1.5,
    borderColor: sanctum.marigold,
  },
  // Sankalps
  sankalp: {
    gap: 10,
    padding: 16,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: "#E4C98F",
    borderLeftWidth: 7,
    borderLeftColor: colors.saffron,
  },
  sankalpHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  garlandBand: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: "#FBF0DC",
  },
  sankalpFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FDEBC8",
    borderWidth: 1,
    borderColor: sanctum.brass,
  },
  // History
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    textAlign: "center",
    paddingVertical: 2,
    borderRadius: 12,
  },
  todayCell: { backgroundColor: "#FDE3B0" },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  totals: { flexDirection: "row", gap: 8 },
  total: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 24,
    backgroundColor: "#FBF0DC",
    borderWidth: 2,
    borderColor: sanctum.brass,
  },
  totalIcon: { height: 42, justifyContent: "center" },
  medals: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  medal: { width: "30%", alignItems: "center", gap: 4, paddingVertical: 6 },
  // League
  league: {
    gap: 16,
    padding: 20,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: sanctum.brassDeep,
  },
  leagueButton: { borderWidth: 1.5, borderColor: sanctum.brassLight },
  inPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.green,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 22,
    backgroundColor: "rgba(243, 213, 138, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(217, 164, 65, 0.45)",
  },
  tierMedal: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: sanctum.brassLight,
  },
  soon: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.22)",
  },
  week: { flexDirection: "row" },
  weekDay: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
  weekTotals: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    columnGap: 16,
  },
});
