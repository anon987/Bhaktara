// Pure habit-layer engine (doc 08 §1–2, doc 10). It takes the documents a
// practice callable has read inside its transaction and returns the new
// documents plus the rewards that are due. No Firestore calls happen here, so
// every rule is unit-testable; progression.ts does the reads and writes.
import {
  advanceStreak,
  badgeEarned,
  BadgeDefinition,
  bhaktiDayAt,
  ChallengeDefinition,
  ChallengeMetric,
  emptyCounters,
  GamificationConfig,
  isBrahmaMuhurta,
  levelForXp,
  PracticeDay,
  ProgressCounters,
  Rank,
  rankForLevel,
  RewardLine,
  RewardType,
  SadhanaConfig,
  SadhanaTask,
  sadhanaTasks,
} from "../../src/domain/progression";

export type SessionType = "JAAP" | "MEDITATION";

export type UserStatsDoc = {
  totalXp: number;
  level: number;
  rank: Rank;
  currentStreak: number;
  longestStreak: number;
  lastQualifyingDay: string | null;
  dailyXp: { day: string | null; xp: number };
  counters: ProgressCounters;
  badgeIds: string[];
  flags: { suspicious: boolean; reason?: string };
  // Impossible-progress window: malas credited in one UTC hour.
  malaWindow: { hour: string | null; count: number };
  // Per-day rate limit on session starts (doc 08: per-function limits).
  rate: { day: string | null; starts: number };
  // Only the latest session of each type may complete, so parallel sessions
  // cannot multiply credit.
  activeSessions: Partial<Record<SessionType, string>>;
  leagueTier: string | null;
};

const num = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function normalizeStats(
  raw: unknown,
  config: GamificationConfig,
): UserStatsDoc {
  const data = record(raw);
  const counters = record(data.counters);
  const totalXp = num(data.totalXp);
  const level = levelForXp(totalXp, config);
  const daily = record(data.dailyXp);
  const flags = record(data.flags);
  const window = record(data.malaWindow);
  const rate = record(data.rate);
  const active = record(data.activeSessions);
  return {
    totalXp,
    level,
    rank: rankForLevel(level, config),
    currentStreak: num(data.currentStreak),
    longestStreak: num(data.longestStreak),
    lastQualifyingDay:
      typeof data.lastQualifyingDay === "string"
        ? data.lastQualifyingDay
        : null,
    dailyXp: {
      day: typeof daily.day === "string" ? daily.day : null,
      xp: num(daily.xp),
    },
    counters: Object.fromEntries(
      Object.keys(emptyCounters()).map((key) => [key, num(counters[key])]),
    ) as ProgressCounters,
    badgeIds: Array.isArray(data.badgeIds)
      ? data.badgeIds.filter((id): id is string => typeof id === "string")
      : [],
    flags: {
      suspicious: flags.suspicious === true,
      ...(typeof flags.reason === "string" ? { reason: flags.reason } : {}),
    },
    malaWindow: {
      hour: typeof window.hour === "string" ? window.hour : null,
      count: num(window.count),
    },
    rate: {
      day: typeof rate.day === "string" ? rate.day : null,
      starts: num(rate.starts),
    },
    activeSessions: {
      ...(typeof active.JAAP === "string" ? { JAAP: active.JAAP } : {}),
      ...(typeof active.MEDITATION === "string"
        ? { MEDITATION: active.MEDITATION }
        : {}),
    },
    leagueTier: typeof data.leagueTier === "string" ? data.leagueTier : null,
  };
}

export function normalizeDay(raw: unknown): PracticeDay {
  const data = record(raw);
  const tasks = record(data.tasks);
  return {
    qualifying: data.qualifying === true,
    xp: num(data.xp),
    tasks: {
      jaap: tasks.jaap === true,
      meditation: tasks.meditation === true,
      prayer: tasks.prayer === true,
    },
    fullSadhana: data.fullSadhana === true,
    malas: num(data.malas),
    malasRewarded: num(data.malasRewarded),
    meditationMinutes: num(data.meditationMinutes),
    meditationSessionsRewarded: num(data.meditationSessionsRewarded),
    mandirVisited: data.mandirVisited === true,
    brahmaMuhurta: data.brahmaMuhurta === true,
  };
}

// ---- Session credit (doc 10 §9) --------------------------------------------

export type SessionDoc = {
  type: SessionType;
  startedAtMs: number;
  status: "OPEN" | "COMPLETED" | "REJECTED";
};
export type SessionCredit =
  | { ok: true; malas: number; minutes: number }
  | {
      ok: false;
      reason: "SESSION_TOO_SHORT" | "SESSION_EXPIRED";
    };

// The server's elapsed time bounds what a session may claim: 60 s per mala,
// and meditation minutes no longer than the session ran. A claim above the
// bound is reduced to what the time allows; nothing allowed is a rejection.
export function creditSession(
  session: SessionDoc,
  claim: { malasCompleted?: number; minutesCompleted?: number },
  nowMs: number,
  config: GamificationConfig,
): SessionCredit {
  const elapsedSeconds = (nowMs - session.startedAtMs) / 1000;
  if (elapsedSeconds > config.session.maxOpenHours * 3600)
    return { ok: false, reason: "SESSION_EXPIRED" };
  const allowedSeconds = Math.max(
    0,
    elapsedSeconds + config.session.graceSeconds,
  );
  if (session.type === "JAAP") {
    const claimed = Math.min(
      claim.malasCompleted ?? 0,
      config.session.maxMalasPerSession,
    );
    const malas = Math.min(
      claimed,
      Math.floor(allowedSeconds / config.session.minSecondsPerMala),
    );
    if (claimed > 0 && malas === 0)
      return { ok: false, reason: "SESSION_TOO_SHORT" };
    return { ok: true, malas, minutes: 0 };
  }
  const claimed = Math.min(
    claim.minutesCompleted ?? 0,
    config.session.maxMeditationMinutes,
  );
  const minutes = Math.min(claimed, Math.floor(allowedSeconds / 60));
  if (claimed > 0 && minutes === 0)
    return { ok: false, reason: "SESSION_TOO_SHORT" };
  return { ok: true, malas: 0, minutes };
}

// ---- Activity application --------------------------------------------------

export type Activity =
  | { kind: "JAAP"; sessionId: string; malas: number }
  | { kind: "MEDITATION"; sessionId: string; minutes: number }
  | { kind: "PRAYER" }
  // The daily Mandir visit: the diya lit in the Mandir tab (D-058).
  | { kind: "MANDIR_VISIT" };

export type ActiveChallenge = ChallengeDefinition & {
  id: string;
  periodKey: string;
  expiresAt: Date;
};

export type UserChallengeDoc = {
  uid: string;
  challengeId: string;
  period: ChallengeDefinition["period"];
  periodKey: string;
  metric: ChallengeMetric;
  progress: number;
  target: number;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  rewarded: boolean;
  expiresAt: Date;
  completedAt?: Date;
};

export type RewardIntent = {
  type: RewardType;
  sourceId: string;
  xp: number;
};

export const ledgerId = (
  uid: string,
  intent: Pick<RewardIntent, "type" | "sourceId">,
) => `${uid}_${intent.type}_${intent.sourceId}`;
// One Mandir visit reward per practice day: the ledger document is
// rewardTransactions/{uid}_MANDIR_VISIT_{bhaktiDay}.
export const mandirVisitSourceId = (bhaktiDay: string) => `VISIT_${bhaktiDay}`;
export const userChallengeId = (uid: string, challenge: ActiveChallenge) =>
  `${uid}_${challenge.id}_${challenge.periodKey}`;

export type ActivityInput = {
  uid: string;
  now: Date;
  timezone: string;
  activity: Activity;
  stats: UserStatsDoc;
  day: PracticeDay;
  config: GamificationConfig;
  sadhana: SadhanaConfig;
  challenges: ActiveChallenge[];
  // Existing userChallenges docs, keyed by userChallengeId.
  userChallenges: Map<string, UserChallengeDoc>;
};

export type ActivityOutcome = {
  bhaktiDay: string;
  stats: UserStatsDoc;
  day: PracticeDay;
  userChallenges: Map<string, UserChallengeDoc>;
  intents: RewardIntent[];
  streakExtended: boolean;
  challengesCompleted: ActiveChallenge[];
  malasCredited: number;
  minutesCredited: number;
};

export function applyActivity(input: ActivityInput): ActivityOutcome {
  const { activity, config, sadhana, now, timezone, uid } = input;
  const bhaktiDay = bhaktiDayAt(now, timezone);
  const stats: UserStatsDoc = structuredClone(input.stats);
  const day: PracticeDay = structuredClone(input.day);
  const userChallenges = new Map(
    [...input.userChallenges].map(([id, doc]) => [id, { ...doc }]),
  );
  const intents: RewardIntent[] = [];
  const counters = stats.counters;

  // 1. Raw practice.
  let malasCredited = 0;
  let minutesCredited = 0;
  let mandirVisits = 0;
  if (activity.kind === "MANDIR_VISIT") {
    // Once per practice day (doc 10 §2): 5 XP, the visit counter (Mandir
    // badges) and MANDIR_VISITS challenges. Not a streak activity by itself
    // (doc 10 §3); a daily challenge it completes still qualifies the day.
    if (!day.mandirVisited) {
      day.mandirVisited = true;
      mandirVisits = 1;
      counters.mandirVisits += 1;
      intents.push({
        type: "MANDIR",
        sourceId: mandirVisitSourceId(bhaktiDay),
        xp: config.xp.mandirVisit,
      });
    }
  } else if (activity.kind === "JAAP") {
    malasCredited = activity.malas;
    day.malas += malasCredited;
    counters.malas += malasCredited;
    for (let n = 1; n <= malasCredited; n += 1) {
      if (day.malasRewarded >= config.limits.malasPerDay) break;
      day.malasRewarded += 1;
      intents.push({
        type: "MALA",
        sourceId: `jaap:${activity.sessionId}:${n}`,
        xp: config.xp.mala,
      });
    }
    const hour = now.toISOString().slice(0, 13);
    stats.malaWindow =
      stats.malaWindow.hour === hour
        ? { hour, count: stats.malaWindow.count + malasCredited }
        : { hour, count: malasCredited };
    if (stats.malaWindow.count > config.suspicious.malasPerHour)
      stats.flags = { suspicious: true, reason: "MALAS_PER_HOUR" };
  } else if (activity.kind === "MEDITATION") {
    minutesCredited = activity.minutes;
    day.meditationMinutes += minutesCredited;
    counters.meditationMinutes += minutesCredited;
    if (
      minutesCredited >= config.limits.meditationSessionMinMinutes &&
      day.meditationSessionsRewarded < config.limits.meditationSessionsPerDay
    ) {
      day.meditationSessionsRewarded += 1;
      intents.push({
        type: "MEDITATION",
        sourceId: `meditation:${activity.sessionId}`,
        xp: config.xp.meditationSession,
      });
    }
  }

  // 2. Sadhana tasks of the daily plan (doc 10 §2).
  const taskDone: Record<SadhanaTask, boolean> = {
    jaap: day.malas >= sadhana.jaapTargetMalas,
    meditation: day.meditationMinutes >= sadhana.meditationTargetMinutes,
    prayer: activity.kind === "PRAYER" || day.tasks.prayer,
  };
  const newTasks = sadhanaTasks.filter(
    (task) => taskDone[task] && !day.tasks[task],
  );
  for (const task of newTasks) {
    day.tasks[task] = true;
    intents.push({
      type: "TASK",
      sourceId: `${task}:${bhaktiDay}`,
      xp: config.xp.task,
    });
  }
  counters.sadhanaTasks += newTasks.length;
  if (
    newTasks.length > 0 &&
    !day.brahmaMuhurta &&
    isBrahmaMuhurta(now, timezone)
  ) {
    day.brahmaMuhurta = true;
    counters.brahmaMuhurtaDays += 1;
  }
  let newFullSadhana = false;
  if (!day.fullSadhana && sadhanaTasks.every((task) => day.tasks[task])) {
    day.fullSadhana = newFullSadhana = true;
    counters.fullSadhanaDays += 1;
    intents.push({
      type: "FULL_SADHANA",
      sourceId: `fullSadhana:${bhaktiDay}`,
      xp: config.xp.fullSadhanaBonus,
    });
  }

  // 3. Streak (D-026): a completed task or one completed mala qualifies.
  let streakExtended = false;
  const qualify = () => {
    if (day.qualifying) return;
    day.qualifying = true;
    const before = stats.currentStreak;
    const next = advanceStreak(stats, bhaktiDay);
    stats.currentStreak = next.currentStreak;
    stats.longestStreak = next.longestStreak;
    stats.lastQualifyingDay = next.lastQualifyingDay;
    streakExtended = next.currentStreak > before || before === 0;
  };
  if (newTasks.length > 0 || malasCredited > 0) qualify();

  // 4. Challenges (doc 10 §6), progressed in the same transaction.
  const deltas: Partial<Record<ChallengeMetric, number>> = {
    SADHANA_TASKS_COMPLETED: newTasks.length,
    FULL_SADHANA_DAYS: newFullSadhana ? 1 : 0,
    JAAP_MALAS: malasCredited,
    MEDITATION_MINUTES: minutesCredited,
    MANDIR_VISITS: mandirVisits,
  };
  const challengesCompleted: ActiveChallenge[] = [];
  const progress = (metrics: ChallengeMetric[]) => {
    for (const challenge of input.challenges) {
      if (!metrics.includes(challenge.metric)) continue;
      const id = userChallengeId(uid, challenge);
      const doc: UserChallengeDoc = userChallenges.get(id) ?? {
        uid,
        challengeId: challenge.id,
        period: challenge.period,
        periodKey: challenge.periodKey,
        metric: challenge.metric,
        progress: 0,
        target: challenge.targetValue,
        status: "ACTIVE",
        rewarded: false,
        expiresAt: challenge.expiresAt,
      };
      if (doc.status !== "ACTIVE") continue;
      const value =
        challenge.metric === "STREAK_DAYS"
          ? Math.max(doc.progress, stats.currentStreak)
          : doc.progress + (deltas[challenge.metric] ?? 0);
      if (value === doc.progress && userChallenges.has(id)) continue;
      if (value === 0) continue;
      doc.progress = Math.min(value, doc.target);
      if (value >= doc.target) {
        doc.status = "COMPLETED";
        doc.rewarded = true;
        doc.completedAt = now;
        counters.challengesCompleted += 1;
        challengesCompleted.push(challenge);
        intents.push({
          type: "CHALLENGE",
          sourceId: `challenge:${challenge.id}:${challenge.periodKey}`,
          xp: challenge.xpReward,
        });
      }
      userChallenges.set(id, doc);
    }
  };
  progress([
    "SADHANA_TASKS_COMPLETED",
    "FULL_SADHANA_DAYS",
    "JAAP_MALAS",
    "MEDITATION_MINUTES",
    "MANDIR_VISITS",
    "STREAK_DAYS",
  ]);
  // A completed daily challenge also qualifies the day (D-026).
  if (
    !day.qualifying &&
    challengesCompleted.some((c) => c.period === "DAILY")
  ) {
    qualify();
    progress(["STREAK_DAYS"]);
  }

  return {
    bhaktiDay,
    stats,
    day,
    userChallenges,
    intents,
    streakExtended,
    challengesCompleted,
    malasCredited,
    minutesCredited,
  };
}

// ---- XP grant with the daily cap (doc 10 §2) -------------------------------

// Grants intents whose ledger entry does not exist yet, oldest first. XP over
// the daily cap is logged with status CAPPED and 0 XP; a reward that only
// partly fits is granted up to the cap.
export function grantRewards(
  intents: RewardIntent[],
  existingLedgerIds: Set<string>,
  uid: string,
  stats: UserStatsDoc,
  day: PracticeDay,
  bhaktiDay: string,
  config: GamificationConfig,
): RewardLine[] {
  if (stats.dailyXp.day !== bhaktiDay)
    stats.dailyXp = { day: bhaktiDay, xp: 0 };
  const lines: RewardLine[] = [];
  const seen = new Set<string>();
  for (const intent of intents) {
    const id = ledgerId(uid, intent);
    if (existingLedgerIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    const room = Math.max(0, config.limits.dailyXpCap - stats.dailyXp.xp);
    const xp = Math.min(intent.xp, room);
    stats.dailyXp.xp += xp;
    stats.totalXp += xp;
    day.xp += xp;
    lines.push({
      ...intent,
      xp,
      requestedXp: intent.xp,
      status: xp < intent.xp ? "CAPPED" : "GRANTED",
    });
  }
  stats.level = levelForXp(stats.totalXp, config);
  stats.rank = rankForLevel(stats.level, config);
  return lines;
}

// Badges whose criteria the updated stats now meet (doc 10 §7).
export function newlyEarnedBadges(
  stats: UserStatsDoc,
  badges: (BadgeDefinition & { id: string })[],
): (BadgeDefinition & { id: string })[] {
  return badges.filter(
    (badge) =>
      badge.isActive &&
      !stats.badgeIds.includes(badge.id) &&
      badgeEarned(badge, stats),
  );
}
