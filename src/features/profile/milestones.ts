import {
  BadgeCriteria,
  badgeCriteria,
  ProgressCounters,
} from "../../domain/progression";
import type { StringKey } from "../../i18n/strings";
import type { BadgeView } from "../../repositories/progressionRepository";

// The Milestones screen: badges grouped by practice, each with how far the
// devotee has come (the same values the server awards on, doc 10 §7).

export type MilestoneGroup =
  "sadhana" | "jaap" | "meditation" | "mandir" | "challenges" | "league" | "xp";
export const milestoneGroups: { id: MilestoneGroup; label: StringKey }[] = [
  { id: "sadhana", label: "groupSadhana" },
  { id: "jaap", label: "groupJaap" },
  { id: "meditation", label: "groupMeditation" },
  { id: "mandir", label: "groupMandir" },
  { id: "challenges", label: "groupChallenges" },
  { id: "league", label: "groupLeague" },
  { id: "xp", label: "groupXp" },
];
const groupOf: Record<BadgeCriteria, MilestoneGroup> = {
  SADHANA_TASKS: "sadhana",
  STREAK_DAYS: "sadhana",
  BRAHMA_MUHURTA_DAYS: "sadhana",
  TOTAL_MALAS: "jaap",
  MEDITATION_MINUTES: "meditation",
  MANDIR_VISITS: "mandir",
  CHALLENGES_COMPLETED: "challenges",
  LEAGUE_PROMOTIONS: "league",
  LEAGUE_TIER: "league",
  TOTAL_XP: "xp",
};
const unitOf: Record<BadgeCriteria, StringKey | null> = {
  SADHANA_TASKS: "unitTasks",
  STREAK_DAYS: "daysUnit",
  BRAHMA_MUHURTA_DAYS: "daysUnit",
  TOTAL_MALAS: "unitMalas",
  MEDITATION_MINUTES: "unitMinutes",
  MANDIR_VISITS: "unitVisits",
  CHALLENGES_COMPLETED: "unitChallenges",
  TOTAL_XP: "points",
  LEAGUE_PROMOTIONS: null,
  LEAGUE_TIER: null,
};

export type MilestoneStats = {
  counters: ProgressCounters;
  longestStreak: number;
  totalXp: number;
};
export type Milestone = {
  badge: BadgeView;
  // Null where the app cannot count it (league badges come with M3).
  progress: { current: number; target: number; unit: StringKey } | null;
};

function valueOf(criteria: BadgeCriteria, stats: MilestoneStats) {
  const values: Record<BadgeCriteria, number | null> = {
    SADHANA_TASKS: stats.counters.sadhanaTasks,
    // The server awards streak badges on the longest streak.
    STREAK_DAYS: stats.longestStreak,
    BRAHMA_MUHURTA_DAYS: stats.counters.brahmaMuhurtaDays,
    TOTAL_MALAS: stats.counters.malas,
    MEDITATION_MINUTES: stats.counters.meditationMinutes,
    MANDIR_VISITS: stats.counters.mandirVisits,
    CHALLENGES_COMPLETED: stats.counters.challengesCompleted,
    TOTAL_XP: stats.totalXp,
    LEAGUE_PROMOTIONS: null,
    LEAGUE_TIER: null,
  };
  return values[criteria];
}

export function milestoneOf(
  badge: BadgeView,
  stats: MilestoneStats,
): Milestone {
  const value = valueOf(badge.criteriaType, stats);
  const unit = unitOf[badge.criteriaType];
  const target = badge.criteriaValue;
  if (value === null || unit === null || typeof target !== "number")
    return { badge, progress: null };
  return {
    badge,
    progress: { current: Math.min(value, target), target, unit },
  };
}

const order = (badge: BadgeView) =>
  typeof badge.criteriaValue === "number"
    ? badge.criteriaValue
    : Number.MAX_SAFE_INTEGER;

// Groups in practice order; within a group, the nearest milestone first.
export function groupMilestones(badges: BadgeView[], stats: MilestoneStats) {
  return milestoneGroups.flatMap(({ id, label }) => {
    const items = badges
      .filter((badge) => groupOf[badge.criteriaType] === id)
      .sort(
        (a, b) =>
          badgeCriteria.indexOf(a.criteriaType) -
            badgeCriteria.indexOf(b.criteriaType) || order(a) - order(b),
      )
      .map((badge) => milestoneOf(badge, stats));
    return items.length ? [{ id, label, items }] : [];
  });
}

export const earnedCount = (badges: BadgeView[]) =>
  badges.filter((badge) => badge.unlocked).length;
