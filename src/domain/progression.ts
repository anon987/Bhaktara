import { z } from "zod";
import { localizedSchema } from "./models";

// Habit layer rules shared by the app and Cloud Functions (doc 10, doc 08).
// Only the server awards XP, streaks, challenges and badges; the app uses
// these helpers to display server state (level progress, practice day).

// ---- Practice day (D-024): 04:00 to 04:00 in the user's local time --------

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DAY_ROLLOVER_HOUR = 4;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const bhaktiDaySchema = z.string().regex(dayPattern);

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(
  instant: Date | number,
  timeZone: string,
): LocalParts {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return parts as unknown as LocalParts;
}

const pad = (value: number) => String(value).padStart(2, "0");
const dayString = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

// bhaktiDay = localDate(eventTime − 4h) in the user's stored timezone (doc 10 §3).
export function bhaktiDayAt(instant: Date | number, timeZone: string): string {
  const shifted = new Date(instant).getTime() - DAY_ROLLOVER_HOUR * 3_600_000;
  const { year, month, day } = localParts(shifted, timeZone);
  return dayString(year, month, day);
}

export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount));
  return dayString(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

// The instant the current practice day ends (the next local 04:00).
export function bhaktiDayEndsAt(
  instant: Date | number,
  timeZone: string,
): Date {
  const now = new Date(instant).getTime();
  const { hour, minute, second } = localParts(now, timeZone);
  const sinceMidnight = hour * 3600 + minute * 60 + second;
  let untilRollover = DAY_ROLLOVER_HOUR * 3600 - sinceMidnight;
  if (untilRollover <= 0) untilRollover += 24 * 3600;
  return new Date(Math.floor(now / 1000) * 1000 + untilRollover * 1000);
}

// Weekly challenges (and later leagues) share one global India week:
// Monday 04:00 IST to the next Monday 04:00 IST (doc 10 §5).
const IST_OFFSET_MS = 330 * 60_000;
export function weekStartDay(instant: Date | number): string {
  const day = bhaktiDayAt(instant, DEFAULT_TIMEZONE);
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
export function weekEndsAt(instant: Date | number): Date {
  const [year, month, date] = weekStartDay(instant).split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, date + 7, DAY_ROLLOVER_HOUR) - IST_OFFSET_MS,
  );
}

// ---- Configuration: appConfig/gamification and appConfig/sadhana ----------

export const ranks = [
  "JIGYASU",
  "SADHAK",
  "BHAKT",
  "ANANYA_BHAKT",
  "PARAM_BHAKT",
] as const;
export type Rank = (typeof ranks)[number];

export const rankNames: Record<Rank, { hi: string; en: string }> = {
  JIGYASU: { hi: "जिज्ञासु", en: "Jigyasu" },
  SADHAK: { hi: "साधक", en: "Sadhak" },
  BHAKT: { hi: "भक्त", en: "Bhakt" },
  ANANYA_BHAKT: { hi: "अनन्य भक्त", en: "Ananya Bhakt" },
  PARAM_BHAKT: { hi: "परम भक्त", en: "Param Bhakt" },
};

const positiveInt = z.number().int().positive();
const count = z.number().int().nonnegative();

export const gamificationConfigSchema = z.object({
  version: positiveInt,
  xp: z.object({
    task: count,
    fullSadhanaBonus: count,
    mala: count,
    meditationSession: count,
    mandirVisit: count,
  }),
  limits: z.object({
    dailyXpCap: positiveInt,
    malasPerDay: count,
    meditationSessionsPerDay: count,
    meditationSessionMinMinutes: positiveInt,
    sessionStartsPerDay: positiveInt,
  }),
  session: z.object({
    minSecondsPerMala: positiveInt,
    maxMalasPerSession: positiveInt,
    maxMeditationMinutes: positiveInt,
    maxOpenHours: positiveInt,
    // Clock tolerance between the app's timer and the server's start time.
    graceSeconds: count,
  }),
  levelCurve: z.object({
    base: z.number().positive(),
    exponent: z.number().positive(),
  }),
  // Lowest level of each rank, ascending (doc 10 §4).
  rankLevels: z
    .array(z.object({ rank: z.enum(ranks), minLevel: positiveInt }))
    .min(1),
  // Impossible-progress flag (doc 10 §9); flags only, XP is never removed.
  suspicious: z.object({ malasPerHour: positiveInt }),
});
export type GamificationConfig = z.infer<typeof gamificationConfigSchema>;

export const defaultGamificationConfig: GamificationConfig = {
  version: 1,
  xp: {
    task: 10,
    fullSadhanaBonus: 20,
    mala: 15,
    meditationSession: 10,
    mandirVisit: 5,
  },
  limits: {
    dailyXpCap: 300,
    malasPerDay: 5,
    meditationSessionsPerDay: 3,
    meditationSessionMinMinutes: 5,
    sessionStartsPerDay: 300,
  },
  session: {
    minSecondsPerMala: 60,
    maxMalasPerSession: 20,
    maxMeditationMinutes: 180,
    maxOpenHours: 12,
    graceSeconds: 15,
  },
  levelCurve: { base: 50, exponent: 1.6 },
  rankLevels: [
    { rank: "JIGYASU", minLevel: 1 },
    { rank: "SADHAK", minLevel: 5 },
    { rank: "BHAKT", minLevel: 15 },
    { rank: "ANANYA_BHAKT", minLevel: 30 },
    { rank: "PARAM_BHAKT", minLevel: 50 },
  ],
  suspicious: { malasPerHour: 20 },
};

export const sadhanaTasks = ["jaap", "meditation", "prayer"] as const;
export type SadhanaTask = (typeof sadhanaTasks)[number];

// The daily prayer is a short puja before the user's chosen deity (D-053),
// performed from a tray of offerings (D-054). `kind` is the tray item;
// `required` items must be offered for the day's prayer to count (the
// kalash, bell, tilak and garland are optional). `label` names the item for
// screen readers; `line` is its Sanskrit samarpan line where there is one.
export const pujaSteps = [
  "kalash",
  "ghanti",
  "chandan",
  "pushp",
  "dhoop",
  "naivedya",
  "deep",
  "shankh",
] as const;
export type PujaStep = (typeof pujaSteps)[number];

export const prayerItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(pujaSteps),
  required: z.boolean(),
  line: localizedSchema.optional(),
  label: localizedSchema,
});
export const sadhanaConfigSchema = z.object({
  version: positiveInt,
  jaapTargetMalas: positiveInt,
  meditationTargetMinutes: positiveInt,
  prayerItems: z.array(prayerItemSchema).min(1).max(12),
});
export type SadhanaConfig = z.infer<typeof sadhanaConfigSchema>;
export type PrayerItem = z.infer<typeof prayerItemSchema>;

export const requiredPrayerIds = (config: SadhanaConfig) =>
  config.prayerItems.filter((item) => item.required).map((item) => item.id);

const pujaStep = (
  kind: PujaStep,
  required: boolean,
  label: { hi: string; en: string },
  line?: { hi: string; en: string },
): PrayerItem => ({
  id: kind,
  kind,
  required,
  label,
  ...(line ? { line } : {}),
});

export const defaultSadhanaConfig: SadhanaConfig = {
  version: 3,
  jaapTargetMalas: 1,
  meditationTargetMinutes: 5,
  prayerItems: [
    pujaStep("kalash", false, {
      hi: "कलश से जल छिड़कें",
      en: "Sprinkle water from the kalash",
    }),
    pujaStep("ghanti", false, { hi: "घंटी बजाएँ", en: "Ring the bell" }),
    pujaStep(
      "chandan",
      false,
      { hi: "चंदन-रोली का तिलक लगाएँ", en: "Apply the chandan-roli tilak" },
      { hi: "ॐ गन्धं समर्पयामि", en: "Om gandham samarpayami" },
    ),
    pujaStep(
      "pushp",
      true,
      { hi: "फूल और माला चढ़ाएँ", en: "Offer flowers and a garland" },
      { hi: "ॐ पुष्पं समर्पयामि", en: "Om pushpam samarpayami" },
    ),
    pujaStep(
      "dhoop",
      true,
      { hi: "धूप दिखाएँ", en: "Offer incense" },
      { hi: "ॐ धूपं आघ्रापयामि", en: "Om dhoopam aaghrapayami" },
    ),
    pujaStep(
      "naivedya",
      true,
      { hi: "भोग लगाएँ", en: "Offer bhog" },
      { hi: "ॐ नैवेद्यं निवेदयामि", en: "Om naivedyam nivedayami" },
    ),
    pujaStep(
      "deep",
      true,
      { hi: "दीप से आरती करें", en: "Do the aarti with the lamp" },
      {
        hi: "ॐ कर्पूर नीराजनं समर्पयामि",
        en: "Om karpoora neerajanam samarpayami",
      },
    ),
    pujaStep("shankh", true, { hi: "शंख बजाएँ", en: "Blow the shankh" }),
  ],
};

// ---- Levels and ranks (doc 10 §4) -----------------------------------------

export const MAX_LEVEL = 200;
// Cumulative XP needed to reach `level`; level 1 starts at 0 XP.
export function xpForLevel(level: number, config: GamificationConfig): number {
  if (level <= 1) return 0;
  const { base, exponent } = config.levelCurve;
  return Math.round(base * (level - 1) ** exponent);
}
export function levelForXp(xp: number, config: GamificationConfig): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1, config)) level += 1;
  return level;
}
export function rankForLevel(level: number, config: GamificationConfig): Rank {
  let rank: Rank = config.rankLevels[0].rank;
  for (const entry of config.rankLevels)
    if (level >= entry.minLevel) rank = entry.rank;
  return rank;
}
export function levelProgress(xp: number, config: GamificationConfig) {
  const level = levelForXp(xp, config);
  const floor = xpForLevel(level, config);
  const next = xpForLevel(level + 1, config);
  return {
    level,
    rank: rankForLevel(level, config),
    xpIntoLevel: xp - floor,
    xpForNextLevel: next - floor,
    fraction: next > floor ? (xp - floor) / (next - floor) : 1,
  };
}

// ---- Streak (D-026, doc 08 §2) --------------------------------------------

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastQualifyingDay: string | null;
};
// Applied once per practice day, when its first qualifying activity lands.
// A day earlier than the last qualifying day (after a timezone change) never
// moves the streak backwards.
export function advanceStreak(state: StreakState, day: string): StreakState {
  const last = state.lastQualifyingDay;
  if (last !== null && day <= last) return state;
  const currentStreak =
    last !== null && addDays(last, 1) === day ? state.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastQualifyingDay: day,
  };
}
// What the app shows today: a streak whose last day is before yesterday has
// lapsed, even though the server only resets it on the next qualifying day.
export function visibleStreak(state: StreakState, today: string): number {
  const last = state.lastQualifyingDay;
  if (last === null) return 0;
  return last === today || addDays(last, 1) === today ? state.currentStreak : 0;
}

// ---- Challenges (doc 10 §6) ------------------------------------------------

export const challengeMetrics = [
  "SADHANA_TASKS_COMPLETED",
  "FULL_SADHANA_DAYS",
  "JAAP_MALAS",
  "MEDITATION_MINUTES",
  "CONTENT_LISTEN_COMPLETE",
  "MANDIR_VISITS",
  "STREAK_DAYS",
] as const;
export type ChallengeMetric = (typeof challengeMetrics)[number];

export const challengeSchema = z.object({
  title: localizedSchema,
  description: localizedSchema,
  period: z.enum(["DAILY", "WEEKLY"]),
  metric: z.enum(challengeMetrics),
  filters: z
    .object({
      contentType: z.string().optional(),
      deityId: z.string().optional(),
      collectionId: z.string().optional(),
    })
    .optional(),
  targetValue: positiveInt,
  xpReward: count,
  badgeId: z.string().optional(),
  audience: z.enum(["ALL", "SIGNED_IN"]),
  isActive: z.boolean(),
});
export type ChallengeDefinition = z.infer<typeof challengeSchema>;

// The period a challenge counts in: the user's practice day for DAILY,
// the global India week for WEEKLY.
export function challengePeriodKey(
  period: ChallengeDefinition["period"],
  instant: Date | number,
  timeZone: string,
): string {
  return period === "DAILY"
    ? `day-${bhaktiDayAt(instant, timeZone)}`
    : `week-${weekStartDay(instant)}`;
}

// ---- Badges (doc 10 §7) ----------------------------------------------------

export const badgeCriteria = [
  "SADHANA_TASKS",
  "STREAK_DAYS",
  "TOTAL_MALAS",
  "MEDITATION_MINUTES",
  "BRAHMA_MUHURTA_DAYS",
  "MANDIR_VISITS",
  "CHALLENGES_COMPLETED",
  "TOTAL_XP",
  "LEAGUE_PROMOTIONS",
  "LEAGUE_TIER",
] as const;
export type BadgeCriteria = (typeof badgeCriteria)[number];

export const badgeSchema = z.object({
  name: localizedSchema,
  description: localizedSchema,
  iconKey: z.string().min(1).max(40),
  criteriaType: z.enum(badgeCriteria),
  criteriaValue: z.union([positiveInt, z.string().min(1)]),
  xpReward: count,
  rewardFrameId: z.string().optional(),
  isActive: z.boolean(),
});
export type BadgeDefinition = z.infer<typeof badgeSchema>;

export type ProgressCounters = {
  sadhanaTasks: number;
  malas: number;
  meditationMinutes: number;
  mandirVisits: number;
  challengesCompleted: number;
  fullSadhanaDays: number;
  brahmaMuhurtaDays: number;
};
export const emptyCounters = (): ProgressCounters => ({
  sadhanaTasks: 0,
  malas: 0,
  meditationMinutes: 0,
  mandirVisits: 0,
  challengesCompleted: 0,
  fullSadhanaDays: 0,
  brahmaMuhurtaDays: 0,
});

// League badges are awarded by the M3 weekly rollover, not by practice.
export function badgeEarned(
  badge: Pick<BadgeDefinition, "criteriaType" | "criteriaValue">,
  stats: { counters: ProgressCounters; longestStreak: number; totalXp: number },
): boolean {
  const target = badge.criteriaValue;
  if (typeof target !== "number") return false;
  const value: Record<BadgeCriteria, number | null> = {
    SADHANA_TASKS: stats.counters.sadhanaTasks,
    STREAK_DAYS: stats.longestStreak,
    TOTAL_MALAS: stats.counters.malas,
    MEDITATION_MINUTES: stats.counters.meditationMinutes,
    BRAHMA_MUHURTA_DAYS: stats.counters.brahmaMuhurtaDays,
    MANDIR_VISITS: stats.counters.mandirVisits,
    CHALLENGES_COMPLETED: stats.counters.challengesCompleted,
    TOTAL_XP: stats.totalXp,
    LEAGUE_PROMOTIONS: null,
    LEAGUE_TIER: null,
  };
  const current = value[badge.criteriaType];
  return current !== null && current >= target;
}

// Brahma Muhurta Sadhak (doc 10 §7): a task completed 04:00–06:00 local.
export function isBrahmaMuhurta(instant: Date | number, timeZone: string) {
  const { hour } = localParts(instant, timeZone);
  return hour >= DAY_ROLLOVER_HOUR && hour < 6;
}

// ---- Callable contracts ----------------------------------------------------

// Client-generated session IDs make startSession safe to retry.
export const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const startSessionInputSchema = z.discriminatedUnion("type", [
  z.object({
    sessionId: sessionIdSchema,
    type: z.literal("JAAP"),
    targetMalas: z.number().int().min(1).max(20).optional(),
    deityId: z.string().max(100).optional(),
  }),
  z.object({
    sessionId: sessionIdSchema,
    type: z.literal("MEDITATION"),
    targetMinutes: z.number().int().min(1).max(180).optional(),
  }),
]);
export type StartSessionInput = z.infer<typeof startSessionInputSchema>;

export const completeSessionInputSchema = z.object({
  sessionId: sessionIdSchema,
  malasCompleted: z.number().int().min(0).max(100).optional(),
  minutesCompleted: z.number().int().min(0).max(600).optional(),
});
export type CompleteSessionInput = z.infer<typeof completeSessionInputSchema>;

export const prayerInputSchema = z.object({
  // The app's practice day; only a consistency check (doc 08 §2).
  bhaktiDay: bhaktiDaySchema.optional(),
  itemIds: z.array(z.string().max(40)).min(1).max(12),
});
export type PrayerInput = z.infer<typeof prayerInputSchema>;

export const profileInputSchema = z.object({
  timezone: z.string().min(1).max(64),
  language: z.enum(["hi", "en"]).optional(),
});

export const rewardTypes = [
  "TASK",
  "FULL_SADHANA",
  "MALA",
  "MEDITATION",
  "CHALLENGE",
  "BADGE",
  "MANDIR",
] as const;
export type RewardType = (typeof rewardTypes)[number];

export type DayTasks = Record<SadhanaTask, boolean>;
export type PracticeDay = {
  qualifying: boolean;
  xp: number;
  tasks: DayTasks;
  fullSadhana: boolean;
  malas: number;
  malasRewarded: number;
  meditationMinutes: number;
  meditationSessionsRewarded: number;
  mandirVisited: boolean;
  brahmaMuhurta: boolean;
};
export const emptyPracticeDay = (): PracticeDay => ({
  qualifying: false,
  xp: 0,
  tasks: { jaap: false, meditation: false, prayer: false },
  fullSadhana: false,
  malas: 0,
  malasRewarded: 0,
  meditationMinutes: 0,
  meditationSessionsRewarded: 0,
  mandirVisited: false,
  brahmaMuhurta: false,
});

export type RewardLine = {
  type: RewardType;
  sourceId: string;
  xp: number;
  requestedXp: number;
  status: "GRANTED" | "CAPPED";
};

// What every practice callable returns, so the app can celebrate without an
// extra read. Retries of a completed session return the stored copy.
export type PracticeResult = {
  status: "COMPLETED" | "ALREADY_DONE";
  bhaktiDay: string;
  xpGranted: number;
  capped: boolean;
  rewards: RewardLine[];
  totalXp: number;
  level: number;
  rank: Rank;
  levelUp: boolean;
  rankUp: boolean;
  currentStreak: number;
  longestStreak: number;
  streakExtended: boolean;
  tasks: DayTasks;
  fullSadhana: boolean;
  malasCredited: number;
  minutesCredited: number;
  challengesCompleted: { id: string; title: { hi: string; en: string } }[];
  badgesUnlocked: { id: string; name: { hi: string; en: string } }[];
};

// Stable error reasons in HttpsError details (doc 08 §6).
export const practiceErrorReasons = [
  "SESSION_TOO_SHORT",
  "SESSION_EXPIRED",
  "SESSION_SUPERSEDED",
  "SESSION_TYPE_MISMATCH",
  "ALREADY_COMPLETED",
  "RATE_LIMITED",
  "CHECKLIST_INCOMPLETE",
  "TIMEZONE_CHANGE_LIMIT",
] as const;
export type PracticeErrorReason = (typeof practiceErrorReasons)[number];
