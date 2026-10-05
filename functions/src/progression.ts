// Habit-layer callables (doc 08 §2): practice sessions, prayer checklist and
// timezone. The app reports activities; only this module decides XP, streaks,
// challenges and badges, in one transaction per call, through the pure engine
// in progressionEngine.ts. Every reward has a deterministic ledger ID
// (rewardTransactions/{uid}_{type}_{sourceId}), so retries never pay twice.
import {
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import {
  BadgeDefinition,
  badgeSchema,
  bhaktiDayAt,
  bhaktiDayEndsAt,
  challengePeriodKey,
  ChallengeDefinition,
  challengeSchema,
  completeSessionInputSchema,
  DEFAULT_TIMEZONE,
  defaultGamificationConfig,
  defaultSadhanaConfig,
  GamificationConfig,
  gamificationConfigSchema,
  isValidTimeZone,
  PracticeErrorReason,
  PracticeResult,
  prayerInputSchema,
  profileInputSchema,
  RewardLine,
  SadhanaConfig,
  sadhanaConfigSchema,
  startSessionInputSchema,
  weekEndsAt,
} from "../../src/domain/progression";
import { db, parse, stripUndefined } from "./core";
import {
  ActiveChallenge,
  Activity,
  applyActivity,
  creditSession,
  grantRewards,
  ledgerId,
  newlyEarnedBadges,
  normalizeDay,
  normalizeStats,
  RewardIntent,
  SessionType,
  userChallengeId,
  UserChallengeDoc,
  UserStatsDoc,
} from "./progressionEngine";

// ---- Caller ----------------------------------------------------------------

// Practice callables accept guests (D-016): any Firebase Auth session.
export type Player = { uid: string; isAnonymous: boolean };
export function playerFrom(auth: CallableRequest["auth"]): Player {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const provider = (auth.token.firebase as { sign_in_provider?: string })
    ?.sign_in_provider;
  return { uid: auth.uid, isAnonymous: provider === "anonymous" };
}

function practiceError(
  reason: PracticeErrorReason,
  message: string,
): HttpsError {
  const code =
    reason === "RATE_LIMITED"
      ? "resource-exhausted"
      : reason === "CHECKLIST_INCOMPLETE" || reason === "SESSION_TYPE_MISMATCH"
        ? "invalid-argument"
        : "failed-precondition";
  return new HttpsError(code, message, { reason });
}

// ---- Configuration and catalog (cached per instance) -----------------------

// Short cache in production; none in the emulator so tests see config edits.
const cacheMs = process.env.FUNCTIONS_EMULATOR === "true" ? 0 : 60_000;
type Cached<T> = { at: number; value: T };
const cache = new Map<string, Cached<unknown>>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Cached<T> | undefined;
  if (hit && Date.now() - hit.at < cacheMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function loadConfigDoc<T>(
  id: string,
  schema: { safeParse(data: unknown): { success: boolean; data?: T } },
  fallback: T,
): Promise<T> {
  const snapshot = await db().collection("appConfig").doc(id).get();
  if (!snapshot.exists) return fallback;
  const parsed = schema.safeParse(snapshot.data());
  if (parsed.success) return parsed.data as T;
  logger.error("Invalid appConfig document; using defaults", { id });
  return fallback;
}

export type ProgressionCatalog = {
  config: GamificationConfig;
  sadhana: SadhanaConfig;
  challenges: (ChallengeDefinition & {
    id: string;
    startAt: Date;
    endAt: Date;
  })[];
  badges: (BadgeDefinition & { id: string })[];
};

const toDate = (value: unknown): Date | null =>
  value instanceof Timestamp ? value.toDate() : null;

export function loadCatalog(): Promise<ProgressionCatalog> {
  return cached("catalog", async () => {
    const [config, sadhana, challengeDocs, badgeDocs] = await Promise.all([
      loadConfigDoc(
        "gamification",
        gamificationConfigSchema,
        defaultGamificationConfig,
      ),
      loadConfigDoc("sadhana", sadhanaConfigSchema, defaultSadhanaConfig),
      db()
        .collection("challenges")
        .where("isActive", "==", true)
        .limit(200)
        .get(),
      db().collection("badges").where("isActive", "==", true).limit(200).get(),
    ]);
    const challenges: ProgressionCatalog["challenges"] = [];
    for (const doc of challengeDocs.docs) {
      const parsed = challengeSchema.safeParse(doc.data());
      const startAt = toDate(doc.get("startAt"));
      const endAt = toDate(doc.get("endAt"));
      if (!parsed.success || !startAt || !endAt) {
        logger.warn("Skipping invalid challenge", { id: doc.id });
        continue;
      }
      challenges.push({ ...parsed.data, id: doc.id, startAt, endAt });
    }
    const badges: ProgressionCatalog["badges"] = [];
    for (const doc of badgeDocs.docs) {
      const parsed = badgeSchema.safeParse(doc.data());
      if (parsed.success) badges.push({ ...parsed.data, id: doc.id });
      else logger.warn("Skipping invalid badge", { id: doc.id });
    }
    return { config, sadhana, challenges, badges };
  });
}

// Challenges live for this user right now, with their period key and the
// moment that period ends (the user's next 04:00, or Monday 04:00 IST).
export function activeChallengesFor(
  catalog: ProgressionCatalog,
  player: Player,
  now: Date,
  timezone: string,
): ActiveChallenge[] {
  return catalog.challenges
    .filter(
      (challenge) =>
        challenge.startAt <= now &&
        now < challenge.endAt &&
        (challenge.audience === "ALL" || !player.isAnonymous),
    )
    .map(({ startAt: _start, endAt, ...challenge }) => {
      const periodEnd =
        challenge.period === "DAILY"
          ? bhaktiDayEndsAt(now, timezone)
          : weekEndsAt(now);
      return {
        ...challenge,
        periodKey: challengePeriodKey(challenge.period, now, timezone),
        expiresAt: periodEnd < endAt ? periodEnd : endAt,
      };
    });
}

// ---- Documents ---------------------------------------------------------------

const refs = (uid: string) => ({
  user: db().collection("users").doc(uid),
  stats: db().collection("userStats").doc(uid),
  day: (day: string) =>
    db().collection("users").doc(uid).collection("days").doc(day),
  session: (id: string) =>
    db().collection("users").doc(uid).collection("sessions").doc(id),
  badge: (id: string) =>
    db().collection("users").doc(uid).collection("badges").doc(id),
  ledger: (id: string) => db().collection("rewardTransactions").doc(id),
  userChallenge: (id: string) => db().collection("userChallenges").doc(id),
});

export const defaultNotificationPreferences = {
  dailyReminder: true,
  reminderTime: "07:00",
  newContent: true,
  festivals: true,
  league: true,
};

// Profiles are server-created (rules deny client creation). The first
// practice call, or setTimezone at app start, creates users/{uid}.
function newProfile(
  player: Player,
  timezone: string,
  language: "hi" | "en",
  now: Timestamp,
) {
  return {
    displayName: null,
    photoUrl: null,
    language,
    mandirDeityId: null,
    notificationPreferences: defaultNotificationPreferences,
    createdAt: now,
    lastActiveAt: now,
    isAnonymous: player.isAnonymous,
    timezone,
    timezoneChangedAt: null,
  };
}

const storedTimezone = (user: DocumentSnapshot) => {
  const value = user.get("timezone");
  return typeof value === "string" && isValidTimeZone(value)
    ? value
    : DEFAULT_TIMEZONE;
};

function statsDocument(stats: UserStatsDoc, now: Timestamp) {
  return stripUndefined({ ...stats, updatedAt: now });
}

// ---- setTimezone ---------------------------------------------------------------

// Doc 10 §3: the app sends the device timezone; a change is accepted at most
// once per 24 hours so extra practice days cannot be manufactured. A refused
// change is not an error: the app calls this on every start.
export async function setTimezone(player: Player, data: unknown) {
  const input = parse(profileInputSchema, data);
  if (!isValidTimeZone(input.timezone))
    throw new HttpsError("invalid-argument", "Unknown timezone.");
  const now = Timestamp.now();
  const ref = refs(player.uid).user;
  return db().runTransaction(async (tx) => {
    const user = await tx.get(ref);
    if (!user.exists) {
      tx.create(
        ref,
        newProfile(player, input.timezone, input.language ?? "hi", now),
      );
      return {
        timezone: input.timezone,
        changed: true,
        bhaktiDay: bhaktiDayAt(now.toDate(), input.timezone),
      };
    }
    const current = storedTimezone(user);
    const changedAt = user.get("timezoneChangedAt");
    const recentlyChanged =
      changedAt instanceof Timestamp &&
      now.toMillis() - changedAt.toMillis() < 24 * 3_600_000;
    const changed = current !== input.timezone && !recentlyChanged;
    tx.update(ref, {
      lastActiveAt: now,
      isAnonymous: player.isAnonymous,
      ...(changed ? { timezone: input.timezone, timezoneChangedAt: now } : {}),
    });
    const timezone = changed ? input.timezone : current;
    return {
      timezone,
      changed,
      ...(current !== input.timezone && !changed
        ? { reason: "TIMEZONE_CHANGE_LIMIT" as const }
        : {}),
      bhaktiDay: bhaktiDayAt(now.toDate(), timezone),
    };
  });
}

// ---- startSession ----------------------------------------------------------------

export async function startSession(player: Player, data: unknown) {
  const input = parse(startSessionInputSchema, data);
  const { config } = await loadCatalog();
  const now = Timestamp.now();
  const r = refs(player.uid);
  return db().runTransaction(async (tx) => {
    const [user, statsSnap, session] = await tx.getAll(
      r.user,
      r.stats,
      r.session(input.sessionId),
    );
    const timezone = storedTimezone(user);
    const bhaktiDay = bhaktiDayAt(now.toDate(), timezone);
    // Retried start: return the session that already exists.
    if (session.exists) {
      if (session.get("type") !== input.type)
        throw practiceError("SESSION_TYPE_MISMATCH", "Session type differs.");
      return {
        sessionId: input.sessionId,
        startedAt: (session.get("startedAt") as Timestamp).toMillis(),
        bhaktiDay: session.get("bhaktiDay") as string,
      };
    }
    const stats = normalizeStats(statsSnap.data(), config);
    if (stats.rate.day !== bhaktiDay)
      stats.rate = { day: bhaktiDay, starts: 0 };
    if (stats.rate.starts >= config.limits.sessionStartsPerDay)
      throw practiceError("RATE_LIMITED", "Too many sessions today.");
    stats.rate.starts += 1;
    stats.activeSessions[input.type] = input.sessionId;
    if (!user.exists)
      tx.create(r.user, newProfile(player, timezone, "hi", now));
    tx.create(
      r.session(input.sessionId),
      stripUndefined({
        type: input.type,
        startedAt: now,
        bhaktiDay,
        status: "OPEN",
        targetMalas: input.type === "JAAP" ? input.targetMalas : undefined,
        targetMinutes:
          input.type === "MEDITATION" ? input.targetMinutes : undefined,
        deityId: input.type === "JAAP" ? input.deityId : undefined,
      }),
    );
    tx.set(r.stats, statsDocument(stats, now));
    return { sessionId: input.sessionId, startedAt: now.toMillis(), bhaktiDay };
  });
}

// ---- Shared settlement -------------------------------------------------------------

type SettleContext = {
  tx: Transaction;
  player: Player;
  catalog: ProgressionCatalog;
  now: Timestamp;
  timezone: string;
  stats: UserStatsDoc;
  activity: Activity;
};

const getAll = (tx: Transaction, list: DocumentReference[]) =>
  list.length ? tx.getAll(...list) : Promise.resolve([] as DocumentSnapshot[]);

// Reads the day, challenge and ledger documents an activity touches, runs the
// engine, grants XP and badges, and queues every write. All reads happen
// before the first write, as Firestore transactions require.
async function settle(ctx: SettleContext): Promise<PracticeResult> {
  const { tx, player, catalog, now, timezone, activity } = ctx;
  const { config, sadhana } = catalog;
  const r = refs(player.uid);
  const nowDate = now.toDate();
  const bhaktiDay = bhaktiDayAt(nowDate, timezone);
  const challenges = activeChallengesFor(catalog, player, nowDate, timezone);
  const challengeIds = challenges.map((c) => userChallengeId(player.uid, c));
  const [daySnap, ...challengeSnaps] = await getAll(tx, [
    r.day(bhaktiDay),
    ...challengeIds.map(r.userChallenge),
  ]);
  const userChallenges = new Map<string, UserChallengeDoc>();
  challengeSnaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data() as UserChallengeDoc & {
      expiresAt: Timestamp;
      completedAt?: Timestamp;
    };
    userChallenges.set(challengeIds[index], {
      ...data,
      expiresAt: data.expiresAt.toDate(),
      ...(data.completedAt ? { completedAt: data.completedAt.toDate() } : {}),
    });
  });
  const before = ctx.stats;
  const outcome = applyActivity({
    uid: player.uid,
    now: nowDate,
    timezone,
    activity,
    stats: before,
    day: normalizeDay(daySnap.data()),
    config,
    sadhana,
    challenges,
    userChallenges,
  });
  const { stats, day } = outcome;

  // XP for practice and challenges, then badges (their XP can unlock an XP
  // milestone badge, so evaluate a few rounds).
  const grantRound = async (intents: RewardIntent[]) => {
    const ids = intents.map((intent) => ledgerId(player.uid, intent));
    const snaps = await getAll(tx, ids.map(r.ledger));
    const existing = new Set(ids.filter((_, i) => snaps[i].exists));
    return grantRewards(
      intents,
      existing,
      player.uid,
      stats,
      day,
      bhaktiDay,
      config,
    );
  };
  const rewards: RewardLine[] = await grantRound(outcome.intents);
  const badgesUnlocked: ProgressionCatalog["badges"] = [];
  for (let round = 0; round < 3; round += 1) {
    const earned = newlyEarnedBadges(stats, catalog.badges);
    if (earned.length === 0) break;
    stats.badgeIds.push(...earned.map((badge) => badge.id));
    badgesUnlocked.push(...earned);
    rewards.push(
      ...(await grantRound(
        earned.map((badge) => ({
          type: "BADGE" as const,
          sourceId: `badge:${badge.id}`,
          xp: badge.xpReward,
        })),
      )),
    );
  }

  // Writes.
  tx.set(r.stats, statsDocument(stats, now));
  tx.set(r.day(bhaktiDay), { ...day, day: bhaktiDay, updatedAt: now });
  for (const [id, doc] of outcome.userChallenges) {
    if (
      userChallenges.get(id)?.progress === doc.progress &&
      userChallenges.get(id)?.status === doc.status
    )
      continue;
    tx.set(r.userChallenge(id), stripUndefined({ ...doc, updatedAt: now }));
  }
  for (const line of rewards)
    tx.create(r.ledger(ledgerId(player.uid, line)), {
      uid: player.uid,
      type: line.type,
      sourceId: line.sourceId,
      xp: line.xp,
      requestedXp: line.requestedXp,
      status: line.status,
      bhaktiDay,
      createdAt: now,
    });
  for (const badge of badgesUnlocked)
    tx.set(r.badge(badge.id), { badgeId: badge.id, unlockedAt: now });

  const xpGranted = rewards.reduce((sum, line) => sum + line.xp, 0);
  return {
    status: "COMPLETED",
    bhaktiDay,
    xpGranted,
    capped: rewards.some((line) => line.status === "CAPPED"),
    rewards,
    totalXp: stats.totalXp,
    level: stats.level,
    rank: stats.rank,
    levelUp: stats.level > before.level,
    rankUp: stats.rank !== before.rank,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    streakExtended: outcome.streakExtended,
    tasks: day.tasks,
    fullSadhana: day.fullSadhana,
    malasCredited: outcome.malasCredited,
    minutesCredited: outcome.minutesCredited,
    challengesCompleted: outcome.challengesCompleted.map((c) => ({
      id: c.id,
      title: c.title,
    })),
    badgesUnlocked: badgesUnlocked.map((b) => ({ id: b.id, name: b.name })),
  };
}

// ---- completeSession -------------------------------------------------------------

export async function completeSession(
  player: Player,
  data: unknown,
): Promise<PracticeResult> {
  const input = parse(completeSessionInputSchema, data);
  const catalog = await loadCatalog();
  const now = Timestamp.now();
  const r = refs(player.uid);
  const outcome = await db().runTransaction(async (tx) => {
    const [user, statsSnap, session] = await tx.getAll(
      r.user,
      r.stats,
      r.session(input.sessionId),
    );
    if (!session.exists)
      throw new HttpsError("not-found", "Session not found.");
    const status = session.get("status");
    // Retries return the stored result, or the stored rejection.
    if (status === "COMPLETED")
      return { result: session.get("result") as PracticeResult };
    if (status === "REJECTED")
      return { rejected: session.get("reason") as PracticeErrorReason };
    const type = session.get("type") as SessionType;
    if (
      (type === "JAAP" && input.malasCompleted === undefined) ||
      (type === "MEDITATION" && input.minutesCompleted === undefined)
    )
      throw practiceError(
        "SESSION_TYPE_MISMATCH",
        "Claim does not match the session.",
      );
    const stats = normalizeStats(statsSnap.data(), catalog.config);
    const reject = (reason: PracticeErrorReason) => {
      tx.update(r.session(input.sessionId), {
        status: "REJECTED",
        reason,
        completedAt: now,
      });
      return { rejected: reason };
    };
    if (stats.activeSessions[type] !== input.sessionId)
      return reject("SESSION_SUPERSEDED");
    const credit = creditSession(
      {
        type,
        startedAtMs: (session.get("startedAt") as Timestamp).toMillis(),
        status: "OPEN",
      },
      input,
      now.toMillis(),
      catalog.config,
    );
    if (!credit.ok) {
      // The session is closed either way; free the active slot.
      delete stats.activeSessions[type];
      tx.set(r.stats, statsDocument(stats, now));
      return reject(credit.reason);
    }
    delete stats.activeSessions[type];
    const result = await settle({
      tx,
      player,
      catalog,
      now,
      timezone: storedTimezone(user),
      stats,
      activity:
        type === "JAAP"
          ? { kind: "JAAP", sessionId: input.sessionId, malas: credit.malas }
          : {
              kind: "MEDITATION",
              sessionId: input.sessionId,
              minutes: credit.minutes,
            },
    });
    tx.update(r.session(input.sessionId), {
      status: "COMPLETED",
      completedAt: now,
      malasCompleted: credit.malas,
      minutesCompleted: credit.minutes,
      result,
    });
    return { result };
  });
  if ("rejected" in outcome && outcome.rejected)
    throw practiceError(
      outcome.rejected,
      outcome.rejected === "SESSION_TOO_SHORT"
        ? "The session was shorter than the minimum time."
        : "This session can no longer be completed.",
    );
  return (outcome as { result: PracticeResult }).result;
}

// ---- completePrayerChecklist -------------------------------------------------------

export async function completePrayerChecklist(
  player: Player,
  data: unknown,
): Promise<PracticeResult> {
  const input = parse(prayerInputSchema, data);
  const catalog = await loadCatalog();
  const required = catalog.sadhana.prayerItems.map((item) => item.id);
  if (!required.every((id) => input.itemIds.includes(id)))
    throw practiceError("CHECKLIST_INCOMPLETE", "Complete every prayer step.");
  const now = Timestamp.now();
  const r = refs(player.uid);
  return db().runTransaction(async (tx) => {
    const [user, statsSnap] = await tx.getAll(r.user, r.stats);
    const timezone = storedTimezone(user);
    const bhaktiDay = bhaktiDayAt(now.toDate(), timezone);
    if (input.bhaktiDay && input.bhaktiDay !== bhaktiDay)
      logger.info("Prayer day differs from the server day", {
        uid: player.uid,
        client: input.bhaktiDay,
        server: bhaktiDay,
      });
    const daySnap = await tx.get(r.day(bhaktiDay));
    if (normalizeDay(daySnap.data()).tasks.prayer) {
      const stats = normalizeStats(statsSnap.data(), catalog.config);
      const day = normalizeDay(daySnap.data());
      return {
        status: "ALREADY_DONE",
        bhaktiDay,
        xpGranted: 0,
        capped: false,
        rewards: [],
        totalXp: stats.totalXp,
        level: stats.level,
        rank: stats.rank,
        levelUp: false,
        rankUp: false,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        streakExtended: false,
        tasks: day.tasks,
        fullSadhana: day.fullSadhana,
        malasCredited: 0,
        minutesCredited: 0,
        challengesCompleted: [],
        badgesUnlocked: [],
      } satisfies PracticeResult;
    }
    const result = await settle({
      tx,
      player,
      catalog,
      now,
      timezone,
      stats: normalizeStats(statsSnap.data(), catalog.config),
      activity: { kind: "PRAYER" },
    });
    // After settle's reads: transactions read everything before writing.
    if (!user.exists)
      tx.create(r.user, newProfile(player, timezone, "hi", now));
    return result;
  });
}

// ---- expireChallenges (doc 08 §4) --------------------------------------------------

// Daily 04:05 IST: mark ended, unfinished user challenges EXPIRED. Idempotent;
// each run handles at most `limit` documents and the next run continues.
export async function expireChallenges(now = Timestamp.now(), limit = 2000) {
  let expired = 0;
  while (expired < limit) {
    const page = await db()
      .collection("userChallenges")
      .where("status", "==", "ACTIVE")
      .where("expiresAt", "<=", now)
      .limit(400)
      .get();
    if (page.empty) break;
    const batch = db().batch();
    for (const doc of page.docs)
      batch.update(doc.ref, {
        status: "EXPIRED",
        updatedAt: FieldValue.serverTimestamp(),
      });
    await batch.commit();
    expired += page.size;
  }
  return { expired };
}
