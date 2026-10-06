// Admin panel v2: dashboard (doc 09 §2). Live counts from Firestore
// aggregation queries (count and sum read index entries, not documents),
// cached for five minutes in jobState/dashboard so a busy panel stays cheap.
// Analytics-based metrics (DAU from Analytics, ad revenue, crash-free rate)
// wait for collection to be enabled (M4).
import {
  AggregateField,
  FieldValue,
  Query,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { contentStatuses } from "../../src/domain/cms";
import { addDays, bhaktiDayAt, DEFAULT_TIMEZONE } from "../../src/domain/progression";
import { Actor, db, parse, requirePermission } from "./core";

const CACHE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
const inputSchema = z.object({ force: z.boolean().optional() }).strict().nullish();

const count = async (query: Query) => (await query.count().get()).data().count;

// One failing figure (a missing or still-building index, say) must not blank
// the whole dashboard: it falls back and is named in `unavailable`.
type Snap = { docs: QueryDocumentSnapshot[]; size: number };
const emptySnap: Snap = { docs: [], size: 0 };

export async function computeDashboard(now = new Date()) {
  const firestore = db();
  const users = firestore.collection("users");
  const stats = firestore.collection("userStats");
  const content = firestore.collection("content");
  const at = (ms: number) => Timestamp.fromMillis(now.getTime() - ms);
  const today = bhaktiDayAt(now, DEFAULT_TIMEZONE);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const unavailable: string[] = [];
  const soft = <T>(name: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch((error: unknown) => {
      unavailable.push(name);
      logger.warn("Dashboard figure unavailable", { name, error: String(error).slice(0, 300) });
      return fallback;
    });

  const [
    totalUsers,
    guests,
    new7,
    new30,
    active1,
    active7,
    activeStreaks,
    flagged,
    statusCounts,
    practiceDays,
    xpToday,
    scheduledSoon,
    challenges,
    festivals,
  ] = await Promise.all([
    soft("totalUsers", count(users), 0),
    soft("guests", count(users.where("isAnonymous", "==", true)), 0),
    soft("new7", count(users.where("createdAt", ">=", at(7 * DAY_MS))), 0),
    soft("new30", count(users.where("createdAt", ">=", at(30 * DAY_MS))), 0),
    soft("active1", count(users.where("lastActiveAt", ">=", at(DAY_MS))), 0),
    soft("active7", count(users.where("lastActiveAt", ">=", at(7 * DAY_MS))), 0),
    soft("activeStreaks", count(stats.where("lastQualifyingDay", ">=", addDays(today, -1))), 0),
    soft("flagged", count(stats.where("flags.suspicious", "==", true)), 0),
    soft(
      "contentByStatus",
      Promise.all(contentStatuses.map((status) => count(content.where("status", "==", status)))),
      contentStatuses.map(() => 0),
    ),
    // Practice per day: practice days recorded, and those that kept a streak.
    soft(
      "practiceSeries",
      Promise.all(
        days.map(async (day) => {
          const group = firestore.collectionGroup("days").where("day", "==", day);
          const [all, qualifying, full] = await Promise.all([
            count(group),
            count(group.where("qualifying", "==", true)),
            count(group.where("fullSadhana", "==", true)),
          ]);
          return { day, practised: all, qualifying, fullSadhana: full };
        }),
      ),
      days.map((day) => ({ day, practised: 0, qualifying: 0, fullSadhana: 0 })),
    ),
    soft(
      "xpToday",
      firestore
        .collection("rewardTransactions")
        .where("bhaktiDay", "==", today)
        .aggregate({ xp: AggregateField.sum("xp") })
        .get()
        .then((snap) => snap.data().xp ?? 0),
      0,
    ),
    soft<Snap>(
      "scheduledSoon",
      content
        .where("status", "==", "SCHEDULED")
        .where("scheduledAt", "<=", Timestamp.fromMillis(now.getTime() + 7 * DAY_MS))
        .orderBy("scheduledAt")
        .limit(20)
        .get(),
      emptySnap,
    ),
    soft<Snap>(
      "challenges",
      firestore.collection("challenges").where("isActive", "==", true).limit(200).get(),
      emptySnap,
    ),
    soft<Snap>(
      "festivals",
      firestore
        .collection("festivals")
        .where("date", ">=", today)
        .where("date", "<=", addDays(today, 45))
        .orderBy("date")
        .limit(20)
        .get(),
      emptySnap,
    ),
  ]);

  // How far ahead the challenge calendar is filled (doc 09 §2: alert < 14 days).
  const lastChallengeEnd = challenges.docs.reduce((latest, doc) => {
    const end = doc.get("endAt") as Timestamp | undefined;
    return end && end.toMillis() > latest ? end.toMillis() : latest;
  }, 0);
  const challengeDaysQueued = Math.max(0, Math.floor((lastChallengeEnd - now.getTime()) / DAY_MS));
  const byStatus = Object.fromEntries(contentStatuses.map((status, i) => [status, statusCounts[i]]));

  const alerts: { level: "info" | "warn"; key: string; count?: number }[] = [];
  if (byStatus.READY > 0) alerts.push({ level: "warn", key: "readyWaiting", count: byStatus.READY });
  if (challengeDaysQueued < 14)
    alerts.push({ level: "warn", key: "challengesShort", count: challengeDaysQueued });
  if (flagged > 0) alerts.push({ level: "warn", key: "flaggedUsers", count: flagged });
  const festivalsWithoutCollection = festivals.docs.filter((doc) => !doc.get("collectionId")).length;
  if (festivalsWithoutCollection > 0)
    alerts.push({ level: "info", key: "festivalsWithoutCollection", count: festivalsWithoutCollection });

  return {
    computedAt: now.toISOString(),
    today,
    users: { total: totalUsers, guests, signedIn: totalUsers - guests, new7, new30, active1, active7 },
    practice: { activeStreaks, xpToday, series: practiceDays },
    content: {
      byStatus,
      scheduledSoon: scheduledSoon.docs.map((doc) => ({
        id: doc.id,
        title: doc.get("title.en") ?? doc.id,
        type: doc.get("type"),
        scheduledAt: (doc.get("scheduledAt") as Timestamp).toDate().toISOString(),
      })),
    },
    challenges: { active: challenges.size, daysQueued: challengeDaysQueued },
    festivals: festivals.docs.map((doc) => ({
      id: doc.id,
      name: doc.get("name.en") ?? doc.id,
      date: doc.get("date"),
      hasCollection: !!doc.get("collectionId"),
    })),
    flaggedUsers: flagged,
    alerts,
    unavailable,
  };
}

export async function getDashboard(actor: Actor, data: unknown) {
  requirePermission(actor, "dashboard.read");
  const input = parse(inputSchema, data);
  const ref = db().collection("jobState").doc("dashboard");
  const cached = await ref.get();
  const at = cached.get("computedAtMs") as number | undefined;
  if (!input?.force && at && Date.now() - at < CACHE_MS) return cached.get("value");
  const value = await computeDashboard();
  await ref.set({ value, computedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  return value;
}
