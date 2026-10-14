// Unit tests for the habit-layer engine: session credit, tasks, streaks,
// challenges, the daily XP cap and badges. Pure: no emulator.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultGamificationConfig as config,
  defaultSadhanaConfig as sadhana,
  emptyPracticeDay,
  PracticeDay,
} from "../../../src/domain/progression";
import {
  ActiveChallenge,
  Activity,
  applyActivity,
  creditSession,
  grantRewards,
  ledgerId,
  mandirVisitSourceId,
  newlyEarnedBadges,
  normalizeStats,
  UserChallengeDoc,
  UserStatsDoc,
} from "../../src/progressionEngine";

const tz = "Asia/Kolkata";
// 2026-10-05 10:00 IST.
const morning = new Date("2026-10-05T04:30:00Z");
const uid = "user1";

function run(
  activity: Activity,
  options: {
    now?: Date;
    stats?: UserStatsDoc;
    day?: PracticeDay;
    challenges?: ActiveChallenge[];
    userChallenges?: Map<string, UserChallengeDoc>;
  } = {},
) {
  return applyActivity({
    uid,
    now: options.now ?? morning,
    timezone: tz,
    activity,
    stats: options.stats ?? normalizeStats(undefined, config),
    day: options.day ?? emptyPracticeDay(),
    config,
    sadhana,
    challenges: options.challenges ?? [],
    userChallenges: options.userChallenges ?? new Map(),
  });
}

test("session credit is bounded by server-measured time", () => {
  const start = morning.getTime();
  const jaap = {
    type: "JAAP" as const,
    startedAtMs: start,
    status: "OPEN" as const,
  };
  // One mala needs 60 s (15 s grace for the app's clock).
  assert.deepEqual(
    creditSession(jaap, { malasCompleted: 1 }, start + 30_000, config),
    {
      ok: false,
      reason: "SESSION_TOO_SHORT",
    },
  );
  assert.deepEqual(
    creditSession(jaap, { malasCompleted: 1 }, start + 50_000, config),
    {
      ok: true,
      malas: 1,
      minutes: 0,
    },
  );
  // Three malas claimed after two minutes: only two are credited.
  assert.deepEqual(
    creditSession(jaap, { malasCompleted: 3 }, start + 120_000, config),
    {
      ok: true,
      malas: 2,
      minutes: 0,
    },
  );
  // Leaving mid-mala closes the session with nothing to credit.
  assert.deepEqual(
    creditSession(jaap, { malasCompleted: 0 }, start + 5_000, config),
    {
      ok: true,
      malas: 0,
      minutes: 0,
    },
  );
  assert.deepEqual(
    creditSession(jaap, { malasCompleted: 1 }, start + 13 * 3_600_000, config),
    { ok: false, reason: "SESSION_EXPIRED" },
  );
  const meditation = { ...jaap, type: "MEDITATION" as const };
  assert.deepEqual(
    creditSession(meditation, { minutesCompleted: 5 }, start + 299_000, config),
    { ok: true, malas: 0, minutes: 5 },
  );
  assert.deepEqual(
    creditSession(
      meditation,
      { minutesCompleted: 10 },
      start + 6 * 60_000,
      config,
    ),
    { ok: true, malas: 0, minutes: 6 },
  );
});

test("one mala completes the jaap task, starts the streak and pays XP", () => {
  const outcome = run({ kind: "JAAP", sessionId: "s1", malas: 1 });
  assert.equal(outcome.bhaktiDay, "2026-10-05");
  assert.equal(outcome.day.tasks.jaap, true);
  assert.equal(outcome.day.qualifying, true);
  assert.equal(outcome.stats.currentStreak, 1);
  assert.equal(outcome.streakExtended, true);
  assert.deepEqual(
    outcome.intents.map((i) => [i.type, i.sourceId, i.xp]),
    [
      ["MALA", "jaap:s1:1", 15],
      ["TASK", "jaap:2026-10-05", 10],
    ],
  );
});

test("mala XP stops after five malas a day but malas still count", () => {
  const day = {
    ...emptyPracticeDay(),
    malas: 4,
    malasRewarded: 4,
    tasks: { jaap: true, meditation: false, prayer: false },
    qualifying: true,
  };
  const outcome = run({ kind: "JAAP", sessionId: "s2", malas: 3 }, { day });
  assert.equal(outcome.day.malas, 7);
  assert.equal(outcome.day.malasRewarded, 5);
  assert.deepEqual(
    outcome.intents.map((i) => i.sourceId),
    ["jaap:s2:1"],
  );
});

test("short meditation counts minutes but no session XP", () => {
  const outcome = run({ kind: "MEDITATION", sessionId: "m1", minutes: 3 });
  assert.equal(outcome.day.meditationMinutes, 3);
  assert.equal(outcome.day.tasks.meditation, false);
  assert.equal(outcome.day.qualifying, false);
  assert.deepEqual(outcome.intents, []);
  const second = run(
    { kind: "MEDITATION", sessionId: "m2", minutes: 5 },
    { day: outcome.day },
  );
  assert.equal(second.day.tasks.meditation, true);
  assert.deepEqual(
    second.intents.map((i) => i.type),
    ["MEDITATION", "TASK"],
  );
});

test("all three tasks pay the full Sadhana bonus once", () => {
  const day = {
    ...emptyPracticeDay(),
    tasks: { jaap: true, meditation: true, prayer: false },
    qualifying: true,
    malas: 1,
    meditationMinutes: 5,
  };
  const outcome = run({ kind: "PRAYER" }, { day });
  assert.equal(outcome.day.fullSadhana, true);
  assert.equal(outcome.stats.counters.fullSadhanaDays, 1);
  assert.deepEqual(
    outcome.intents.map((i) => i.sourceId),
    ["prayer:2026-10-05", "fullSadhana:2026-10-05"],
  );
  const again = run(
    { kind: "PRAYER" },
    { day: outcome.day, stats: outcome.stats },
  );
  assert.deepEqual(again.intents, []);
  assert.equal(again.stats.counters.fullSadhanaDays, 1);
});

test("streak continues on the next day, holds the same day and restarts after a gap", () => {
  const first = run({ kind: "PRAYER" });
  // 03:59 IST next morning is still the same practice day.
  const sameDay = run(
    { kind: "JAAP", sessionId: "s", malas: 1 },
    {
      now: new Date("2026-10-05T22:29:00Z"),
      stats: first.stats,
      day: first.day,
    },
  );
  assert.equal(sameDay.bhaktiDay, "2026-10-05");
  assert.equal(sameDay.stats.currentStreak, 1);
  // 04:00 IST starts the next day.
  const next = run(
    { kind: "PRAYER" },
    { now: new Date("2026-10-05T22:30:00Z"), stats: sameDay.stats },
  );
  assert.equal(next.bhaktiDay, "2026-10-06");
  assert.equal(next.stats.currentStreak, 2);
  const afterGap = run(
    { kind: "PRAYER" },
    { now: new Date("2026-10-09T04:30:00Z"), stats: next.stats },
  );
  assert.equal(afterGap.stats.currentStreak, 1);
  assert.equal(afterGap.stats.longestStreak, 2);
});

test("Brahma Muhurta is recorded once for a task before 06:00", () => {
  const early = new Date("2026-10-04T23:00:00Z"); // 04:30 IST
  const outcome = run({ kind: "PRAYER" }, { now: early });
  assert.equal(outcome.day.brahmaMuhurta, true);
  assert.equal(outcome.stats.counters.brahmaMuhurtaDays, 1);
  assert.equal(run({ kind: "PRAYER" }).day.brahmaMuhurta, false);
});

const challenge = (
  overrides: Partial<ActiveChallenge> = {},
): ActiveChallenge => ({
  id: "malas-3",
  title: { hi: "तीन माला", en: "Three malas" },
  description: { hi: "", en: "" },
  period: "DAILY",
  metric: "JAAP_MALAS",
  targetValue: 3,
  xpReward: 30,
  audience: "ALL",
  isActive: true,
  periodKey: "day-2026-10-05",
  expiresAt: new Date("2026-10-05T22:30:00Z"),
  ...overrides,
});

test("challenges progress, complete once and pay their XP", () => {
  const challenges = [challenge()];
  const first = run({ kind: "JAAP", sessionId: "a", malas: 2 }, { challenges });
  const doc = first.userChallenges.get("user1_malas-3_day-2026-10-05");
  assert.equal(doc?.progress, 2);
  assert.equal(doc?.status, "ACTIVE");
  const second = run(
    { kind: "JAAP", sessionId: "b", malas: 2 },
    {
      challenges,
      userChallenges: first.userChallenges,
      day: first.day,
      stats: first.stats,
    },
  );
  const done = second.userChallenges.get("user1_malas-3_day-2026-10-05");
  assert.equal(done?.status, "COMPLETED");
  assert.equal(done?.progress, 3);
  assert.equal(second.stats.counters.challengesCompleted, 1);
  assert.ok(
    second.intents.some(
      (i) => i.sourceId === "challenge:malas-3:day-2026-10-05",
    ),
  );
  const third = run(
    { kind: "JAAP", sessionId: "c", malas: 1 },
    {
      challenges,
      userChallenges: second.userChallenges,
      day: second.day,
      stats: second.stats,
    },
  );
  assert.ok(!third.intents.some((i) => i.type === "CHALLENGE"));
});

test("a completed daily challenge qualifies the day on its own", () => {
  const minutes = challenge({
    id: "med-3",
    metric: "MEDITATION_MINUTES",
    targetValue: 3,
  });
  const outcome = run(
    { kind: "MEDITATION", sessionId: "m", minutes: 3 },
    { challenges: [minutes] },
  );
  assert.equal(outcome.day.tasks.meditation, false);
  assert.equal(outcome.day.qualifying, true);
  assert.equal(outcome.stats.currentStreak, 1);
});

test("the daily cap logs extra XP as CAPPED and skips existing ledger entries", () => {
  const stats = normalizeStats(
    { totalXp: 1000, dailyXp: { day: "2026-10-05", xp: 290 } },
    config,
  );
  const day = emptyPracticeDay();
  const intents = [
    { type: "TASK" as const, sourceId: "prayer:2026-10-05", xp: 10 },
    { type: "MALA" as const, sourceId: "jaap:x:1", xp: 15 },
    { type: "MALA" as const, sourceId: "jaap:x:2", xp: 15 },
  ];
  const existing = new Set([ledgerId(uid, intents[0])]);
  const lines = grantRewards(
    intents,
    existing,
    uid,
    stats,
    day,
    "2026-10-05",
    config,
  );
  assert.deepEqual(
    lines.map((l) => [l.sourceId, l.xp, l.status]),
    [
      ["jaap:x:1", 10, "CAPPED"],
      ["jaap:x:2", 0, "CAPPED"],
    ],
  );
  assert.equal(stats.totalXp, 1010);
  assert.equal(stats.dailyXp.xp, 300);
  // A new practice day resets the cap.
  const tomorrow = grantRewards(
    [{ type: "TASK", sourceId: "prayer:2026-10-06", xp: 10 }],
    new Set(),
    uid,
    stats,
    emptyPracticeDay(),
    "2026-10-06",
    config,
  );
  assert.equal(tomorrow[0].status, "GRANTED");
  assert.deepEqual(stats.dailyXp, { day: "2026-10-06", xp: 10 });
});

test("badges unlock once when their criteria are met", () => {
  const badges = [
    {
      id: "pehli-mala",
      name: { hi: "पहली माला", en: "First mala" },
      description: { hi: "", en: "" },
      iconKey: "mala",
      criteriaType: "TOTAL_MALAS" as const,
      criteriaValue: 1,
      xpReward: 20,
      isActive: true,
    },
    {
      id: "league",
      name: { hi: "", en: "" },
      description: { hi: "", en: "" },
      iconKey: "x",
      criteriaType: "LEAGUE_TIER" as const,
      criteriaValue: "GOLD",
      xpReward: 0,
      isActive: true,
    },
  ];
  const outcome = run({ kind: "JAAP", sessionId: "s", malas: 1 });
  assert.deepEqual(
    newlyEarnedBadges(outcome.stats, badges).map((b) => b.id),
    ["pehli-mala"],
  );
  outcome.stats.badgeIds.push("pehli-mala");
  assert.deepEqual(newlyEarnedBadges(outcome.stats, badges), []);
});

test("too many malas in an hour flags the user without removing XP", () => {
  let stats = normalizeStats(undefined, config);
  let day = emptyPracticeDay();
  for (let i = 0; i < 3; i += 1) {
    const outcome = run(
      { kind: "JAAP", sessionId: `s${i}`, malas: 8 },
      { stats, day },
    );
    stats = outcome.stats;
    day = outcome.day;
  }
  assert.equal(stats.flags.suspicious, true);
  assert.equal(stats.counters.malas, 24);
});

// ---- Mandir visit (D-058, doc 10 §2) ------------------------------------------

test("the first Mandir visit of the day pays 5 XP once; the second changes nothing", () => {
  const first = run({ kind: "MANDIR_VISIT" });
  assert.equal(first.day.mandirVisited, true);
  assert.equal(first.stats.counters.mandirVisits, 1);
  assert.deepEqual(
    first.intents.map((i) => [i.type, i.sourceId, i.xp]),
    [["MANDIR", "VISIT_2026-10-05", 5]],
  );
  // The ledger document: rewardTransactions/{uid}_MANDIR_VISIT_{day}.
  assert.equal(
    ledgerId(uid, first.intents[0]),
    "user1_MANDIR_VISIT_2026-10-05",
  );
  // Doc 10 §3: a Mandir visit is not a qualifying streak activity, and it is
  // not the prayer task (the puja still completes that).
  assert.equal(first.day.qualifying, false);
  assert.equal(first.stats.currentStreak, 0);
  assert.equal(first.streakExtended, false);
  assert.deepEqual(first.day.tasks, {
    jaap: false,
    meditation: false,
    prayer: false,
  });
  const second = run(
    { kind: "MANDIR_VISIT" },
    { day: first.day, stats: first.stats },
  );
  assert.deepEqual(second.intents, []);
  assert.equal(second.stats.counters.mandirVisits, 1);
  assert.deepEqual(second.day, first.day);
  // The next practice day (04:00 IST) counts again.
  const tomorrow = run(
    { kind: "MANDIR_VISIT" },
    { now: new Date("2026-10-05T22:30:00Z"), stats: second.stats },
  );
  assert.equal(tomorrow.bhaktiDay, "2026-10-06");
  assert.equal(tomorrow.stats.counters.mandirVisits, 2);
  assert.equal(tomorrow.intents[0].sourceId, mandirVisitSourceId("2026-10-06"));
});

test("a Mandir visit keeps the streak of a day that already qualified", () => {
  const prayer = run({ kind: "PRAYER" });
  const visit = run(
    { kind: "MANDIR_VISIT" },
    { day: prayer.day, stats: prayer.stats },
  );
  assert.equal(visit.day.qualifying, true);
  assert.equal(visit.stats.currentStreak, 1);
  assert.equal(visit.day.tasks.prayer, true);
  assert.deepEqual(
    visit.intents.map((i) => i.type),
    ["MANDIR"],
  );
});

test("the Mandir visit XP respects the daily cap", () => {
  const outcome = run({ kind: "MANDIR_VISIT" });
  const stats = normalizeStats(
    { totalXp: 500, dailyXp: { day: "2026-10-05", xp: 298 } },
    config,
  );
  const lines = grantRewards(
    outcome.intents,
    new Set(),
    uid,
    stats,
    outcome.day,
    "2026-10-05",
    config,
  );
  assert.deepEqual(
    lines.map((l) => [l.type, l.xp, l.requestedXp, l.status]),
    [["MANDIR", 2, 5, "CAPPED"]],
  );
  assert.equal(stats.dailyXp.xp, 300);
  // An existing ledger entry (a retried visit) pays nothing.
  const retry = grantRewards(
    outcome.intents,
    new Set([ledgerId(uid, outcome.intents[0])]),
    uid,
    normalizeStats(undefined, config),
    emptyPracticeDay(),
    "2026-10-05",
    config,
  );
  assert.deepEqual(retry, []);
});

test("Mandir visits advance MANDIR_VISITS challenges and a daily one qualifies the day", () => {
  const daily = challenge({
    id: "mandir-1",
    metric: "MANDIR_VISITS",
    targetValue: 1,
    xpReward: 10,
  });
  const weekly = challenge({
    id: "mandir-5",
    period: "WEEKLY",
    metric: "MANDIR_VISITS",
    targetValue: 5,
    periodKey: "week-2026-10-05",
  });
  const jaap = challenge();
  const outcome = run(
    { kind: "MANDIR_VISIT" },
    { challenges: [daily, weekly, jaap] },
  );
  assert.equal(
    outcome.userChallenges.get("user1_mandir-1_day-2026-10-05")?.status,
    "COMPLETED",
  );
  assert.equal(
    outcome.userChallenges.get("user1_mandir-5_week-2026-10-05")?.progress,
    1,
  );
  assert.equal(
    outcome.userChallenges.has("user1_malas-3_day-2026-10-05"),
    false,
  );
  assert.ok(
    outcome.intents.some(
      (i) => i.sourceId === "challenge:mandir-1:day-2026-10-05",
    ),
  );
  // D-026: a completed daily challenge qualifies the day.
  assert.equal(outcome.day.qualifying, true);
  assert.equal(outcome.stats.currentStreak, 1);
  // A repeat visit the same day adds no progress.
  const again = run(
    { kind: "MANDIR_VISIT" },
    {
      challenges: [daily, weekly],
      day: outcome.day,
      stats: outcome.stats,
      userChallenges: outcome.userChallenges,
    },
  );
  assert.equal(
    again.userChallenges.get("user1_mandir-5_week-2026-10-05")?.progress,
    1,
  );
  assert.deepEqual(again.intents, []);
});

test("the 7th and 30th Mandir visits unlock the Mandir badges", () => {
  const mandirBadge = (id: string, criteriaValue: number) => ({
    id,
    name: { hi: "", en: id },
    description: { hi: "", en: "" },
    iconKey: "temple",
    criteriaType: "MANDIR_VISITS" as const,
    criteriaValue,
    xpReward: 25,
    isActive: true,
  });
  const badges = [mandirBadge("mandir-7", 7), mandirBadge("mandir-30", 30)];
  const sixth = normalizeStats({ counters: { mandirVisits: 6 } }, config);
  assert.deepEqual(newlyEarnedBadges(sixth, badges), []);
  const seventh = run({ kind: "MANDIR_VISIT" }, { stats: sixth });
  assert.deepEqual(
    newlyEarnedBadges(seventh.stats, badges).map((b) => b.id),
    ["mandir-7"],
  );
  const thirtieth = run(
    { kind: "MANDIR_VISIT" },
    {
      stats: normalizeStats(
        { counters: { mandirVisits: 29 }, badgeIds: ["mandir-7"] },
        config,
      ),
    },
  );
  assert.deepEqual(
    newlyEarnedBadges(thirtieth.stats, badges).map((b) => b.id),
    ["mandir-30"],
  );
});
