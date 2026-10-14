import type { Firestore } from "firebase/firestore";
import {
  addDays,
  badgeSchema,
  bhaktiDayAt,
  challengePeriodKey,
  challengeSchema,
  defaultGamificationConfig,
  defaultSadhanaConfig,
  emptyCounters,
  emptyPracticeDay,
  GamificationConfig,
  gamificationConfigSchema,
  levelProgress,
  PracticeDay,
  PracticeResult,
  ProgressCounters,
  SadhanaConfig,
  sadhanaConfigSchema,
  StartSessionInput,
  visibleStreak,
} from "../domain/progression";
import type { Localized } from "../i18n/strings";
import { SessionService } from "../services/auth/session";
import { FirestoreApi } from "./firestoreApi";

// Habit layer client (doc 08 §2). The app reports practice through callable
// functions and reads its own progress; it never writes XP, streaks or tasks.

export type Callable = <T>(name: string, data: unknown) => Promise<T>;

export type ChallengeView = {
  id: string;
  title: Localized;
  description: Localized;
  period: "DAILY" | "WEEKLY";
  target: number;
  progress: number;
  xpReward: number;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
};
export type BadgeView = {
  id: string;
  name: Localized;
  description: Localized;
  iconKey: string;
  unlocked: boolean;
};
export type ProgressSnapshot = {
  timezone: string;
  bhaktiDay: string;
  totalXp: number;
  level: number;
  rank: ReturnType<typeof levelProgress>["rank"];
  levelFraction: number;
  xpToNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  counters: ProgressCounters;
  today: PracticeDay;
  // Recent practice days, newest first.
  days: { day: string; record: PracticeDay }[];
  config: GamificationConfig;
  sadhana: SadhanaConfig;
  challenges: ChallengeView[];
  badges: BadgeView[];
};

export interface ProgressionRepository {
  setTimezone(
    timezone: string,
    language?: "hi" | "en",
  ): Promise<{ timezone: string; bhaktiDay: string }>;
  startSession(
    input: StartSessionInput,
  ): Promise<{ sessionId: string; startedAt: number; bhaktiDay: string }>;
  completeSession(input: {
    sessionId: string;
    malasCompleted?: number;
    minutesCompleted?: number;
  }): Promise<PracticeResult>;
  completePrayer(input: {
    bhaktiDay?: string;
    itemIds: string[];
  }): Promise<PracticeResult>;
  // The daily Mandir visit (the diya lit): once per practice day, 5 XP
  // (doc 08, doc 10).
  recordMandirVisit(input: { deityId: string }): Promise<PracticeResult>;
  load(timezone: string): Promise<ProgressSnapshot>;
}

// Why a practice call failed, in terms the screens can explain.
export type PracticeFailure =
  | { kind: "offline" }
  | { kind: "rejected"; reason: string }
  | { kind: "error" };
export function practiceFailure(error: unknown): PracticeFailure {
  const raw =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const code = raw.replace(/^functions\//, "");
  const details =
    typeof error === "object" && error !== null && "details" in error
      ? (error as { details?: { reason?: unknown } }).details
      : undefined;
  if (typeof details?.reason === "string")
    return { kind: "rejected", reason: details.reason };
  // The JavaScript SDK reports a failed fetch as "internal"; an undeployed
  // function answers 404 ("not-found" without details).
  if (
    [
      "unavailable",
      "deadline-exceeded",
      "internal",
      "not-found",
      "unknown",
    ].includes(code)
  )
    return { kind: "offline" };
  return { kind: "error" };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function toPracticeDay(raw: unknown): PracticeDay {
  const data = record(raw);
  const tasks = record(data.tasks);
  return {
    ...emptyPracticeDay(),
    qualifying: data.qualifying === true,
    xp: num(data.xp),
    tasks: {
      jaap: tasks.jaap === true,
      meditation: tasks.meditation === true,
      prayer: tasks.prayer === true,
    },
    fullSadhana: data.fullSadhana === true,
    malas: num(data.malas),
    meditationMinutes: num(data.meditationMinutes),
    mandirVisited: data.mandirVisited === true,
  };
}

const toDate = (value: unknown): Date | null =>
  value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? new Date((value as { toMillis(): number }).toMillis())
    : null;

export function createProgressionRepository(
  db: Firestore,
  session: SessionService,
  api: FirestoreApi,
  call: Callable,
): ProgressionRepository {
  const uid = async () => {
    const current = await session.ensureSession();
    if (!current) throw new Error("No session");
    return current.uid;
  };
  const getDoc = (path: string, ...segments: string[]) =>
    api.getDocFromServer(api.doc(db, path, ...segments));
  return {
    setTimezone: (timezone, language) =>
      call("setTimezone", language ? { timezone, language } : { timezone }),
    startSession: (input) => call("startSession", input),
    completeSession: (input) => call("completeSession", input),
    completePrayer: (input) => call("completePrayerChecklist", input),
    recordMandirVisit: (input) => call("recordMandirVisit", input),
    async load(timezone) {
      const id = await uid();
      const now = new Date();
      const [
        statsSnap,
        gamificationSnap,
        sadhanaSnap,
        daysSnap,
        challengeSnap,
        badgeSnap,
      ] = await Promise.all([
        getDoc("userStats", id),
        getDoc("appConfig", "gamification"),
        getDoc("appConfig", "sadhana"),
        api.getDocsFromServer(
          api.query(
            api.collection(db, "users", id, "days"),
            // Ascending ID range: served by the built-in index (a descending
            // order on the document ID needs a composite index).
            api.where(
              api.documentId(),
              ">=",
              addDays(bhaktiDayAt(now, timezone), -41),
            ),
            api.orderBy(api.documentId()),
            api.limit(42),
          ),
        ),
        api.getDocsFromServer(
          api.query(
            api.collection(db, "challenges"),
            api.where("isActive", "==", true),
            api.limit(50),
          ),
        ),
        api.getDocsFromServer(
          api.query(
            api.collection(db, "badges"),
            api.where("isActive", "==", true),
            api.limit(50),
          ),
        ),
      ]);
      const config =
        gamificationConfigSchema.safeParse(gamificationSnap.data()).data ??
        defaultGamificationConfig;
      const sadhana =
        sadhanaConfigSchema.safeParse(sadhanaSnap.data()).data ??
        defaultSadhanaConfig;
      const stats = record(statsSnap.data());
      const bhaktiDay = bhaktiDayAt(now, timezone);
      const days = daysSnap.docs
        .map((snap) => ({ day: snap.id, record: toPracticeDay(snap.data()) }))
        .reverse();
      const live = challengeSnap.docs.flatMap((snap) => {
        const parsed = challengeSchema.safeParse(snap.data());
        const startAt = toDate(snap.get("startAt"));
        const endAt = toDate(snap.get("endAt"));
        if (!parsed.success || !startAt || !endAt) return [];
        if (now < startAt || now >= endAt) return [];
        return [{ id: snap.id, ...parsed.data }];
      });
      const progressSnaps = await Promise.all(
        live.map((challenge) =>
          getDoc(
            "userChallenges",
            `${id}_${challenge.id}_${challengePeriodKey(challenge.period, now, timezone)}`,
          ),
        ),
      );
      const challenges: ChallengeView[] = live.map((challenge, index) => {
        const progress = record(progressSnaps[index].data());
        return {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          period: challenge.period,
          target: challenge.targetValue,
          xpReward: challenge.xpReward,
          progress: num(progress.progress),
          status:
            progress.status === "COMPLETED" || progress.status === "EXPIRED"
              ? progress.status
              : "ACTIVE",
        };
      });
      const unlocked = new Set(
        Array.isArray(stats.badgeIds) ? (stats.badgeIds as string[]) : [],
      );
      const badges: BadgeView[] = badgeSnap.docs.flatMap((snap) => {
        const parsed = badgeSchema.safeParse(snap.data());
        return parsed.success
          ? [
              {
                id: snap.id,
                name: parsed.data.name,
                description: parsed.data.description,
                iconKey: parsed.data.iconKey,
                unlocked: unlocked.has(snap.id),
              },
            ]
          : [];
      });
      const totalXp = num(stats.totalXp);
      const level = levelProgress(totalXp, config);
      const counters = record(stats.counters);
      return {
        timezone,
        bhaktiDay,
        totalXp,
        level: level.level,
        rank: level.rank,
        levelFraction: level.fraction,
        xpToNextLevel: level.xpForNextLevel - level.xpIntoLevel,
        currentStreak: visibleStreak(
          {
            currentStreak: num(stats.currentStreak),
            longestStreak: num(stats.longestStreak),
            lastQualifyingDay:
              typeof stats.lastQualifyingDay === "string"
                ? stats.lastQualifyingDay
                : null,
          },
          bhaktiDay,
        ),
        longestStreak: num(stats.longestStreak),
        counters: Object.fromEntries(
          Object.keys(emptyCounters()).map((key) => [key, num(counters[key])]),
        ) as ProgressCounters,
        today:
          days.find((entry) => entry.day === bhaktiDay)?.record ??
          emptyPracticeDay(),
        days,
        config,
        sadhana,
        challenges,
        badges,
      };
    },
  };
}
