// Pure guest → account merge rules (doc 21 §4, D-020). accountMerge.ts reads
// the documents and applies these in retry-safe transactions; nothing here
// touches Firestore, so every rule is unit-testable.
import {
  addDays,
  emptyCounters,
  GamificationConfig,
  levelForXp,
  ProgressCounters,
  rankForLevel,
  sadhanaTasks,
  StreakState,
} from "../../src/domain/progression";
import { normalizeDay, UserStatsDoc } from "./progressionEngine";

type Raw = Record<string, unknown>;

// What the merge has done so far, kept on accountMerges/{guestUid}.progress and
// updated in the same transaction as each batch of writes, so a retried merge
// neither loses nor double-counts anything.
export type MergeProgress = {
  xpAdded: number;
  ledgerAdded: number;
  // XP of the copied ledger entries per practice day (their bhaktiDay).
  xpByDay: Record<string, number>;
  badgeIds: string[];
  badgesAdded: number;
  favoritesAdded: number;
  daysAdded: number;
  challengesMerged: number;
  // Added to the account's userStats.counters at the end.
  counters: ProgressCounters;
};

export const emptyMergeProgress = (): MergeProgress => ({
  xpAdded: 0,
  ledgerAdded: 0,
  xpByDay: {},
  badgeIds: [],
  badgesAdded: 0,
  favoritesAdded: 0,
  daysAdded: 0,
  challengesMerged: 0,
  counters: emptyCounters(),
});

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function normalizeProgress(raw: unknown): MergeProgress {
  const data = (raw ?? {}) as Raw;
  const counters = (data.counters ?? {}) as Raw;
  const xpByDay = (data.xpByDay ?? {}) as Raw;
  return {
    xpAdded: num(data.xpAdded),
    ledgerAdded: num(data.ledgerAdded),
    xpByDay: Object.fromEntries(Object.entries(xpByDay).map(([day, xp]) => [day, num(xp)])),
    badgeIds: Array.isArray(data.badgeIds)
      ? data.badgeIds.filter((id): id is string => typeof id === "string")
      : [],
    badgesAdded: num(data.badgesAdded),
    favoritesAdded: num(data.favoritesAdded),
    daysAdded: num(data.daysAdded),
    challengesMerged: num(data.challengesMerged),
    counters: Object.fromEntries(
      Object.keys(emptyCounters()).map((key) => [key, num(counters[key])]),
    ) as ProgressCounters,
  };
}

// ---- Ledger (XP) ----------------------------------------------------------------

// A guest ledger entry as the account's: same type, sourceId, XP and day, so
// later rewards with the same (type, sourceId) dedupe against it. `mergedFrom`
// marks XP that was earned as a guest: it counts toward lifetime totals only,
// never toward a league week (doc 10 §5, doc 21 §4).
export function ledgerEntryFor(
  guestEntry: Raw,
  targetUid: string,
  guestUid: string,
  mergedAt: unknown,
): Raw {
  return { ...guestEntry, uid: targetUid, mergedFrom: guestUid, mergedAt };
}

// Records a copied ledger entry in the progress.
export function countLedgerEntry(progress: MergeProgress, entry: Raw) {
  const xp = num(entry.xp);
  progress.ledgerAdded += 1;
  progress.xpAdded += xp;
  if (typeof entry.bhaktiDay === "string" && xp > 0)
    progress.xpByDay[entry.bhaktiDay] = (progress.xpByDay[entry.bhaktiDay] ?? 0) + xp;
}

// ---- Practice days (Sadhana history) -------------------------------------------

export type DayMerge = {
  // Fields to write (merged into the account's document).
  doc: Raw;
  // True when the account had no document for that day.
  added: boolean;
  counters: ProgressCounters;
};

// Union of one practice day: one entry per day and per task. Tasks, the full
// Sadhana, the Mandir visit and Brahma Muhurta are true if either side has
// them (and are counted once); malas and minutes practised on both sides add
// up. The day's XP is the account's plus the guest XP copied into the ledger
// for that day, so it matches the ledger.
export function mergeDay(
  accountRaw: Raw | undefined,
  guestRaw: Raw,
  xpAdded: number,
): DayMerge {
  const guest = normalizeDay(guestRaw);
  const counters = emptyCounters();
  if (!accountRaw) {
    counters.sadhanaTasks = sadhanaTasks.filter((task) => guest.tasks[task]).length;
    counters.malas = guest.malas;
    counters.meditationMinutes = guest.meditationMinutes;
    counters.mandirVisits = guest.mandirVisited ? 1 : 0;
    counters.fullSadhanaDays = guest.fullSadhana ? 1 : 0;
    counters.brahmaMuhurtaDays = guest.brahmaMuhurta ? 1 : 0;
    return { doc: { ...guestRaw, ...guest, xp: xpAdded }, added: true, counters };
  }
  const account = normalizeDay(accountRaw);
  const tasks = { ...account.tasks };
  for (const task of sadhanaTasks)
    if (guest.tasks[task] && !tasks[task]) {
      tasks[task] = true;
      counters.sadhanaTasks += 1;
    }
  const fullSadhana =
    account.fullSadhana || guest.fullSadhana || sadhanaTasks.every((task) => tasks[task]);
  if (fullSadhana && !account.fullSadhana) counters.fullSadhanaDays = 1;
  if (guest.mandirVisited && !account.mandirVisited) counters.mandirVisits = 1;
  if (guest.brahmaMuhurta && !account.brahmaMuhurta) counters.brahmaMuhurtaDays = 1;
  counters.malas = guest.malas;
  counters.meditationMinutes = guest.meditationMinutes;
  return {
    doc: {
      qualifying: account.qualifying || guest.qualifying,
      xp: account.xp + xpAdded,
      tasks,
      fullSadhana,
      malas: account.malas + guest.malas,
      // Rewards already paid that day on either side still count toward
      // that day's limits.
      malasRewarded: account.malasRewarded + guest.malasRewarded,
      meditationMinutes: account.meditationMinutes + guest.meditationMinutes,
      meditationSessionsRewarded:
        account.meditationSessionsRewarded + guest.meditationSessionsRewarded,
      mandirVisited: account.mandirVisited || guest.mandirVisited,
      brahmaMuhurta: account.brahmaMuhurta || guest.brahmaMuhurta,
      ...(accountRaw.mandirDeityId == null && guestRaw.mandirDeityId != null
        ? { mandirDeityId: guestRaw.mandirDeityId }
        : {}),
    },
    added: false,
    counters,
  };
}

export function addCounters(into: ProgressCounters, delta: ProgressCounters) {
  for (const key of Object.keys(into) as (keyof ProgressCounters)[])
    into[key] += delta[key];
}

// ---- User challenges ------------------------------------------------------------

const millis = (value: unknown): number | null => {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function")
    return (value as { toMillis(): number }).toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
};

// One challenge period on both sides: the higher progress, completed if
// either completed (first completion kept), rewarded if either was. The XP
// itself is the CHALLENGE ledger entry `challenge:{id}:{periodKey}`, which the
// ledger copy adds only when the account does not have it, so the reward is
// never paid twice. `completed` is true when the account gains a completion.
export function mergeChallenge(
  accountRaw: Raw | undefined,
  guestRaw: Raw,
  targetUid: string,
): { doc: Raw; completed: boolean } {
  if (!accountRaw)
    return {
      doc: { ...guestRaw, uid: targetUid },
      completed: guestRaw.status === "COMPLETED",
    };
  const accountDone = accountRaw.status === "COMPLETED";
  const guestDone = guestRaw.status === "COMPLETED";
  const target = num(accountRaw.target) || num(guestRaw.target);
  const progress = Math.min(
    Math.max(num(accountRaw.progress), num(guestRaw.progress)),
    target || Number.MAX_SAFE_INTEGER,
  );
  const doc: Raw = {
    progress,
    status: accountDone || guestDone ? "COMPLETED" : accountRaw.status,
    rewarded: accountRaw.rewarded === true || guestRaw.rewarded === true,
  };
  if (accountDone || guestDone) {
    const times = [accountRaw.completedAt, guestRaw.completedAt].filter(
      (value) => millis(value) !== null,
    );
    times.sort((a, b) => millis(a)! - millis(b)!);
    if (times[0] !== undefined) doc.completedAt = times[0];
  }
  return { doc, completed: guestDone && !accountDone };
}

// ---- Streaks ---------------------------------------------------------------------

// max(guest, account) for the current streak, the longest streak and the last
// qualifying day (doc 21 §4). A current streak only counts if it is still
// running at the merged last qualifying day (its own last day is that day or
// the day before), so merging a recent guest day can never revive an
// account's lapsed streak.
export function mergeStreaks(account: StreakState, guest: StreakState): StreakState {
  const days = [account.lastQualifyingDay, guest.lastQualifyingDay].filter(
    (day): day is string => day !== null,
  );
  const last = days.length ? days.sort().at(-1)! : null;
  const running = (side: StreakState) =>
    last !== null &&
    side.lastQualifyingDay !== null &&
    (side.lastQualifyingDay === last || addDays(side.lastQualifyingDay, 1) === last)
      ? side.currentStreak
      : 0;
  const currentStreak = Math.max(running(account), running(guest));
  return {
    currentStreak,
    longestStreak: Math.max(account.longestStreak, guest.longestStreak, currentStreak),
    lastQualifyingDay: last,
  };
}

// ---- userStats -------------------------------------------------------------------

// The account's stats after the merge: lifetime XP plus the copied ledger XP
// (level and rank recomputed), streaks by mergeStreaks, counters plus what the
// merged days and challenges added, badges united. League tier, session state
// and rate limits stay the account's (guests are never in leagues). A day
// that already counts toward the daily cap also counts the merged XP.
export function mergeStats(
  account: UserStatsDoc,
  guest: UserStatsDoc,
  progress: MergeProgress,
  config: GamificationConfig,
): UserStatsDoc {
  const stats: UserStatsDoc = structuredClone(account);
  stats.totalXp = account.totalXp + progress.xpAdded;
  stats.level = levelForXp(stats.totalXp, config);
  stats.rank = rankForLevel(stats.level, config);
  Object.assign(stats, mergeStreaks(account, guest));
  addCounters(stats.counters, progress.counters);
  stats.badgeIds = [...new Set([...account.badgeIds, ...guest.badgeIds, ...progress.badgeIds])];
  if (stats.dailyXp.day && progress.xpByDay[stats.dailyXp.day])
    stats.dailyXp = {
      day: stats.dailyXp.day,
      xp: stats.dailyXp.xp + progress.xpByDay[stats.dailyXp.day],
    };
  if (!account.flags.suspicious && guest.flags.suspicious)
    stats.flags = { suspicious: true, reason: `GUEST_${guest.flags.reason ?? "FLAGGED"}` };
  return stats;
}

// ---- Profile ---------------------------------------------------------------------

const languages = ["hi", "en"];

// The account keeps its name, photo and notification preferences; the guest's
// language (and Mandir deity) are used only where the account has none.
export function profileFallbacks(account: Raw, guest: Raw): Raw {
  const updates: Raw = {};
  if (!languages.includes(account.language as string) && languages.includes(guest.language as string))
    updates.language = guest.language;
  if (account.mandirDeityId == null && typeof guest.mandirDeityId === "string")
    updates.mandirDeityId = guest.mandirDeityId;
  return updates;
}
