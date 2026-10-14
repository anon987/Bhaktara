import { parseArgs } from "node:util";
import { Timestamp } from "firebase-admin/firestore";
import {
  BadgeDefinition,
  badgeSchema,
  ChallengeDefinition,
  challengeSchema,
  defaultGamificationConfig,
  defaultSadhanaConfig,
  gamificationConfigSchema,
  sadhanaConfigSchema,
} from "../../src/domain/progression";
import {
  describeTarget,
  FirestoreTarget,
  resolveTarget,
  withFirestore,
} from "../firebase/target";

// Habit-layer configuration (doc 10): appConfig/gamification and
// appConfig/sadhana with the doc 10 defaults, the V1 badge set (doc 10 §7)
// and a rolling set of development challenges. The challenges are synthetic
// placeholders; the reviewed 8-week launch set is roadmap item m2-seed-challenges.

const badge = (
  id: string,
  hi: string,
  en: string,
  criteriaType: BadgeDefinition["criteriaType"],
  criteriaValue: number | string,
  xpReward: number,
  iconKey: string,
  description: { hi: string; en: string },
): [string, BadgeDefinition] => [
  id,
  {
    name: { hi, en },
    description,
    iconKey,
    criteriaType,
    criteriaValue,
    xpReward,
    isActive: true,
  },
];

export const v1Badges: [string, BadgeDefinition][] = [
  badge(
    "pehli-sadhana",
    "पहली साधना",
    "First Sadhana",
    "SADHANA_TASKS",
    1,
    10,
    "lotus",
    {
      hi: "पहला साधना कार्य पूरा किया",
      en: "Completed your first Sadhana task",
    },
  ),
  badge("streak-7", "सात दिन", "7-day streak", "STREAK_DAYS", 7, 25, "diya", {
    hi: "लगातार 7 दिन साधना",
    en: "Practised 7 days in a row",
  }),
  badge(
    "streak-21",
    "इक्कीस दिन",
    "21-day streak",
    "STREAK_DAYS",
    21,
    50,
    "diya",
    { hi: "लगातार 21 दिन साधना", en: "Practised 21 days in a row" },
  ),
  badge(
    "streak-108",
    "एक सौ आठ दिन",
    "108-day streak",
    "STREAK_DAYS",
    108,
    150,
    "sun",
    { hi: "लगातार 108 दिन साधना", en: "Practised 108 days in a row" },
  ),
  badge("pehli-mala", "पहली माला", "First mala", "TOTAL_MALAS", 1, 10, "mala", {
    hi: "पहली माला का जाप पूरा किया",
    en: "Completed your first mala",
  }),
  badge("mala-108", "108 माला", "108 malas", "TOTAL_MALAS", 108, 100, "mala", {
    hi: "कुल 108 माला जाप",
    en: "Chanted 108 malas in all",
  }),
  badge(
    "mala-1008",
    "1008 माला",
    "1008 malas",
    "TOTAL_MALAS",
    1008,
    300,
    "mala",
    { hi: "कुल 1008 माला जाप", en: "Chanted 1008 malas in all" },
  ),
  badge(
    "dhyan-60",
    "एक घंटा ध्यान",
    "60 minutes of meditation",
    "MEDITATION_MINUTES",
    60,
    25,
    "om",
    { hi: "कुल 60 मिनट ध्यान", en: "Meditated 60 minutes in all" },
  ),
  badge(
    "dhyan-500",
    "500 मिनट ध्यान",
    "500 minutes of meditation",
    "MEDITATION_MINUTES",
    500,
    100,
    "om",
    { hi: "कुल 500 मिनट ध्यान", en: "Meditated 500 minutes in all" },
  ),
  badge(
    "brahma-muhurta",
    "ब्रह्म मुहूर्त साधक",
    "Brahma Muhurta Sadhak",
    "BRAHMA_MUHURTA_DAYS",
    7,
    50,
    "sunrise",
    {
      hi: "7 दिन सुबह 4 से 6 बजे के बीच साधना",
      en: "Practised between 4 and 6 am on 7 days",
    },
  ),
  badge(
    "mandir-7",
    "सात मंदिर दर्शन",
    "7 Mandir visits",
    "MANDIR_VISITS",
    7,
    25,
    "temple",
    {
      hi: "7 दिन मंदिर में दीप जलाया",
      en: "Lit the diya in the Mandir on 7 days",
    },
  ),
  badge(
    "mandir-30",
    "तीस मंदिर दर्शन",
    "30 Mandir visits",
    "MANDIR_VISITS",
    30,
    75,
    "temple",
    {
      hi: "30 दिन मंदिर में दीप जलाया",
      en: "Lit the diya in the Mandir on 30 days",
    },
  ),
  badge(
    "challenges-10",
    "दस संकल्प",
    "10 challenges",
    "CHALLENGES_COMPLETED",
    10,
    50,
    "flag",
    { hi: "10 चुनौतियाँ पूरी कीं", en: "Completed 10 challenges" },
  ),
  badge(
    "challenges-50",
    "पचास संकल्प",
    "50 challenges",
    "CHALLENGES_COMPLETED",
    50,
    150,
    "flag",
    { hi: "50 चुनौतियाँ पूरी कीं", en: "Completed 50 challenges" },
  ),
  badge(
    "league-first-promotion",
    "पहली उन्नति",
    "First promotion",
    "LEAGUE_PROMOTIONS",
    1,
    25,
    "arrow",
    {
      hi: "पहली बार लीग में आगे बढ़े",
      en: "Promoted in the league for the first time",
    },
  ),
  badge(
    "league-gold",
    "स्वर्ण लीग",
    "Reached Gold",
    "LEAGUE_TIER",
    "GOLD",
    50,
    "crown",
    { hi: "स्वर्ण लीग तक पहुँचे", en: "Reached the Gold league" },
  ),
  badge(
    "league-divine",
    "दिव्य लीग",
    "Reached Divine",
    "LEAGUE_TIER",
    "DIVINE",
    150,
    "crown",
    { hi: "दिव्य लीग तक पहुँचे", en: "Reached the Divine league" },
  ),
  badge("xp-1000", "1,000 अंक", "1,000 XP", "TOTAL_XP", 1000, 0, "star", {
    hi: "कुल 1,000 अंक",
    en: "Earned 1,000 XP",
  }),
  badge("xp-10000", "10,000 अंक", "10,000 XP", "TOTAL_XP", 10000, 0, "star", {
    hi: "कुल 10,000 अंक",
    en: "Earned 10,000 XP",
  }),
];

const challenge = (
  id: string,
  period: ChallengeDefinition["period"],
  metric: ChallengeDefinition["metric"],
  targetValue: number,
  xpReward: number,
  title: { hi: string; en: string },
  description: { hi: string; en: string },
): [string, ChallengeDefinition] => [
  id,
  {
    title,
    description,
    period,
    metric,
    targetValue,
    xpReward,
    audience: "ALL",
    isActive: true,
  },
];

export const devChallenges: [string, ChallengeDefinition][] = [
  challenge(
    "dev-daily-2-mala",
    "DAILY",
    "JAAP_MALAS",
    2,
    20,
    { hi: "आज दो माला जाप", en: "Two malas today" },
    { hi: "आज 2 माला जाप पूरा करें", en: "Complete 2 malas of jaap today" },
  ),
  challenge(
    "dev-daily-10-dhyan",
    "DAILY",
    "MEDITATION_MINUTES",
    10,
    20,
    { hi: "आज 10 मिनट ध्यान", en: "10 minutes of meditation" },
    { hi: "आज कुल 10 मिनट ध्यान करें", en: "Meditate 10 minutes in all today" },
  ),
  challenge(
    "dev-weekly-15-mala",
    "WEEKLY",
    "JAAP_MALAS",
    15,
    75,
    { hi: "इस सप्ताह 15 माला", en: "15 malas this week" },
    {
      hi: "सोमवार से रविवार तक 15 माला जाप",
      en: "Chant 15 malas between Monday and Sunday",
    },
  ),
  challenge(
    "dev-weekly-5-poorna",
    "WEEKLY",
    "FULL_SADHANA_DAYS",
    5,
    100,
    { hi: "पाँच दिन पूर्ण साधना", en: "5 days of full Sadhana" },
    {
      hi: "इस सप्ताह 5 दिन तीनों साधना पूरी करें",
      en: "Complete all three practices on 5 days this week",
    },
  ),
  challenge(
    "dev-weekly-3-mandir",
    "WEEKLY",
    "MANDIR_VISITS",
    3,
    30,
    { hi: "इस सप्ताह तीन मंदिर दर्शन", en: "3 Mandir visits this week" },
    {
      hi: "इस सप्ताह 3 दिन मंदिर में दीप जलाएँ",
      en: "Light the diya in the Mandir on 3 days this week",
    },
  ),
];

// Challenges run from the start of the current month for eight weeks.
export async function seedProgression(
  target: FirestoreTarget,
  now = new Date(),
) {
  const startAt = Timestamp.fromDate(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );
  const endAt = Timestamp.fromMillis(
    startAt.toMillis() + 8 * 7 * 86_400_000 + 31 * 86_400_000,
  );
  await withFirestore(target, async (db) => {
    const batch = db.batch();
    batch.set(
      db.collection("appConfig").doc("gamification"),
      gamificationConfigSchema.parse(defaultGamificationConfig),
    );
    batch.set(
      db.collection("appConfig").doc("sadhana"),
      sadhanaConfigSchema.parse(defaultSadhanaConfig),
    );
    for (const [id, value] of v1Badges)
      batch.set(db.collection("badges").doc(id), badgeSchema.parse(value));
    for (const [id, value] of devChallenges)
      batch.set(db.collection("challenges").doc(id), {
        ...challengeSchema.parse(value),
        startAt,
        endAt,
      });
    await batch.commit();
  });
}

if (process.argv[1]?.endsWith("progression/seed.ts")) {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      "confirm-project": { type: "string" },
    },
  });
  const target = resolveTarget(values.project, values["confirm-project"]);
  seedProgression(target)
    .then(() =>
      console.log(
        `Seeded ${describeTarget(target)} with habit-layer config, ${v1Badges.length} badges and ${devChallenges.length} development challenges.`,
      ),
    )
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
