import { randomUUID } from "node:crypto";
import {
  DocumentData,
  FieldPath,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  getHomeLayoutSchema,
  previewHomeFeedSchema,
  rebuildHomeFeedSchema,
  updateHomeLayoutSchema,
} from "../../src/domain/cms";
import {
  buildHomeFeedSections,
  HomeBannerSource,
  HomeCardSource,
  homeCardSourceSchema,
  HomeCollection,
  HomeLanguage,
  homeLanguages,
  homeLayoutDocumentSchema,
  HomeLayoutSection,
  HomeRailSort,
  homeRailLimit,
  homeSectionSchema,
  nextHomeBannerChange,
  resolveHomeBanners,
} from "../../src/domain/home";
import { ContentType } from "../../src/domain/models";
import {
  homeFeedBannerSchema,
  homeFeedDocumentSchema,
} from "../../src/repositories/firestoreSchemas";
import { Actor, db, parse, requirePermission, writeAudit } from "./core";

// Server-side Home feed (doc 05 precomputed feed, doc 06 §3, doc 08 §4).
//
// buildHomeFeed resolves `homeLayout/{hi,en}` + published content + published
// collections + active banners into `homeFeeds/{hi,en}`, the one document
// the app reads for Home.
//
// Rebuild trigger (dirty flag + scheduled check):
// - Firestore triggers on content, banners, collections and homeLayout mark
//   `jobState/buildHomeFeed.dirty` when a write can change a feed. The
//   trigger reads the flag first and writes only when it is not already set,
//   so a burst (an import, the nightly popularity update) costs one write.
// - The scheduled `buildHomeFeed` runs every 5 minutes. Idle runs read only
//   the state document. It rebuilds when the flag is set, when a banner
//   window opens or closes (`nextChangeAt`), when a previous build never
//   finished, or when the feed is older than a day (missed trigger guard).
// - A build first claims the flag (dirty=false, new claimId), then reads its
//   sources, so a change committed after the claim marks the flag again and
//   is picked up by the next run. The feed write is a transaction that
//   checks the claim: an older, slower build never overwrites a newer one.
// - Home manager edits and the manual rebuild callable build at once (doc 09
//   §6 "publishing triggers buildHomeFeed"); if that fails the flag stays set
//   and the scheduler retries.

export const HOME_FEED_SCHEMA_VERSION = 1;
// Active banners scanned per build (inactive ones are kept for reuse and do
// not count). Far above homeLimits.banners.
const BANNER_SCAN_LIMIT = 100;
// Doc 06: collections hold at most 200 item IDs inline.
const COLLECTION_ITEM_LIMIT = 200;
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_FEED_AGE_MS = 24 * 3_600_000;
// Section types this app version draws; others pass through unvalidated.
const drawableTypes = new Set([
  "PROGRESS",
  "SADHANA",
  "SHORTCUTS",
  "RAIL",
  "QUOTE",
]);

const layoutRef = (language: HomeLanguage) =>
  db().collection("homeLayout").doc(language);
const feedRef = (language: HomeLanguage) =>
  db().collection("homeFeeds").doc(language);
const contentRef = (id: string) => db().collection("content").doc(id);
export const homeFeedStateRef = () =>
  db().collection("jobState").doc("buildHomeFeed");

const millis = (value: unknown) =>
  value instanceof Timestamp ? value.toMillis() : undefined;
const iso = (value: unknown) => {
  const at = typeof value === "number" ? value : millis(value);
  return at === undefined ? null : new Date(at).toISOString();
};

// Deep copy with sorted keys and Timestamps as millis: change detection that
// ignores Firestore's key order.
const comparable = (value: unknown): unknown => {
  if (value instanceof Timestamp) return { $ms: value.toMillis() };
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, comparable(entry)]),
    );
  return value;
};
const fingerprint = (value: unknown) => JSON.stringify(comparable(value));

// Firestore rejects undefined values; Timestamps are kept as they are.
const withoutUndefined = <T>(value: T): T => {
  if (value instanceof Timestamp || value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  ) as T;
};

// ---- Change detection (used by the Firestore triggers) ----

export type HomeSourceKind =
  "content" | "banners" | "collections" | "homeLayout";

const cardFields = (data: DocumentData) => ({
  type: data.type,
  title: data.title,
  thumb: data.media?.thumb,
  durationSeconds: data.durationSeconds,
  popularityScore: data.popularityScore,
  publishedAt: data.publishedAt,
});

// Whether a write can change any feed. Drafts and edits to fields the feed
// never shows (description, tags, search tokens, private data) are ignored.
export function affectsHomeFeed(
  kind: HomeSourceKind,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  switch (kind) {
    case "content": {
      const live = (data?: DocumentData) => data?.status === "PUBLISHED";
      if (!live(before) && !live(after)) return false;
      if (live(before) !== live(after)) return true;
      return (
        fingerprint(cardFields(before!)) !== fingerprint(cardFields(after!))
      );
    }
    case "banners":
      return before?.isActive === true || after?.isActive === true;
    case "collections":
      return before?.isPublished === true || after?.isPublished === true;
    case "homeLayout":
      return fingerprint(before?.sections) !== fingerprint(after?.sections);
  }
}

// Sets the dirty flag unless it is already set (one read, at most one write).
export async function markHomeFeedDirty(reason: string) {
  const ref = homeFeedStateRef();
  if ((await ref.get()).data()?.dirty === true) return false;
  await ref.set(
    { dirty: true, dirtyAt: FieldValue.serverTimestamp(), dirtyReason: reason },
    { merge: true },
  );
  return true;
}

export async function handleHomeSourceWrite(
  kind: HomeSourceKind,
  id: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
) {
  if (!affectsHomeFeed(kind, before, after)) return false;
  return markHomeFeedDirty(`${kind}/${id}`);
}

// ---- Sources ----

type LayoutResult =
  | { ok: true; sections: HomeLayoutSection[] }
  | {
      ok: false;
      reason: "MISSING_LAYOUT" | "INVALID_LAYOUT";
      issues?: string[];
    };

function parseLayout(data: DocumentData | undefined): LayoutResult {
  if (!data) return { ok: false, reason: "MISSING_LAYOUT" };
  const result = homeLayoutDocumentSchema.safeParse(data);
  if (!result.success)
    return {
      ok: false,
      reason: "INVALID_LAYOUT",
      issues: result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  return { ok: true, sections: result.data.sections };
}

function toCardSource(id: string, data: DocumentData | undefined) {
  if (data?.status !== "PUBLISHED") return null;
  const result = homeCardSourceSchema.safeParse({
    id,
    type: data.type,
    title: data.title,
    media: data.media,
    durationSeconds: data.durationSeconds,
    popularityScore: data.popularityScore,
    publishedAt: millis(data.publishedAt),
  });
  if (!result.success) {
    logger.warn("Published content cannot be a Home card", { contentId: id });
    return null;
  }
  return result.data;
}

function toBannerSource(
  id: string,
  data: DocumentData,
): HomeBannerSource<Timestamp> | null {
  const value = {
    id,
    title: data.title,
    subtitle: data.subtitle,
    ctaText: data.ctaText,
    image: data.image,
    target: data.target,
    priority: data.priority,
    startAt: data.startAt,
    endAt: data.endAt,
    isActive: data.isActive,
    languages: Array.isArray(data.languages) ? data.languages : undefined,
  };
  // Only banners whose resolved copy satisfies the app's read contract.
  if (
    typeof value.priority !== "number" ||
    !homeFeedBannerSchema.safeParse(value).success
  ) {
    logger.warn("Active banner cannot be shown on Home", { bannerId: id });
    return null;
  }
  return value as HomeBannerSource<Timestamp>;
}

type Sources = {
  content: HomeCardSource[];
  collections: HomeCollection[];
  banners: HomeBannerSource<Timestamp>[];
  reads: number;
};

type CollectionRail = {
  contentType?: ContentType;
  limit: number;
  sorted: boolean;
};

// Bounded reads: per distinct (type, sort) pool one query of at most 20 docs,
// referenced collections (≤ 200 items each, read in rail-sized chunks unless
// a sort needs them all), and at most 100 active banners.
async function loadSources(layouts: HomeLayoutSection[][]): Promise<Sources> {
  let reads = 0;
  const content = new Map<string, HomeCardSource>();
  const pools = new Map<
    string,
    { contentType?: ContentType; sort: HomeRailSort; limit: number }
  >();
  const collectionRails = new Map<string, CollectionRail[]>();
  for (const section of layouts.flat()) {
    if (!section.visible || section.type !== "RAIL") continue;
    const source = section.source ?? {};
    const limit = homeRailLimit(section);
    if (source.collectionId) {
      const rails = collectionRails.get(source.collectionId) ?? [];
      rails.push({
        contentType: source.contentType,
        limit,
        sorted: !!source.sort,
      });
      collectionRails.set(source.collectionId, rails);
      continue;
    }
    const sort = source.sort ?? "POPULAR";
    const key = `${source.contentType ?? "*"}:${sort}`;
    pools.set(key, {
      contentType: source.contentType,
      sort,
      limit: Math.max(pools.get(key)?.limit ?? 0, limit),
    });
  }

  const [bannerSnapshot, ...poolSnapshots] = await Promise.all([
    db()
      .collection("banners")
      .where("isActive", "==", true)
      .limit(BANNER_SCAN_LIMIT)
      .get(),
    ...[...pools.values()].map((pool) => {
      let query = db().collection("content").where("status", "==", "PUBLISHED");
      if (pool.contentType) query = query.where("type", "==", pool.contentType);
      return query
        .orderBy(
          pool.sort === "NEW" ? "publishedAt" : "popularityScore",
          "desc",
        )
        .orderBy(FieldPath.documentId(), "asc")
        .limit(pool.limit)
        .get();
    }),
  ]);
  for (const snapshot of [bannerSnapshot, ...poolSnapshots])
    reads += Math.max(snapshot.size, 1);
  if (bannerSnapshot.size === BANNER_SCAN_LIMIT)
    logger.warn("More active banners than one Home build scans", {
      limit: BANNER_SCAN_LIMIT,
    });
  for (const snapshot of poolSnapshots)
    for (const doc of snapshot.docs) {
      const card = toCardSource(doc.id, doc.data());
      if (card) content.set(doc.id, card);
    }

  const collections: HomeCollection[] = [];
  const collectionIds = [...collectionRails.keys()].sort();
  const collectionSnapshots = collectionIds.length
    ? await db().getAll(
        ...collectionIds.map((id) => db().collection("collections").doc(id)),
      )
    : [];
  reads += collectionSnapshots.length;
  for (const snapshot of collectionSnapshots) {
    const data = snapshot.data();
    if (data?.isPublished !== true || !Array.isArray(data.itemIds)) {
      logger.warn("Home rail references a missing or unpublished collection", {
        collectionId: snapshot.id,
      });
      collections.push({ id: snapshot.id, itemIds: [] });
      continue;
    }
    const itemIds = [
      ...new Set(
        (data.itemIds as unknown[]).filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ].slice(0, COLLECTION_ITEM_LIMIT);
    collections.push({ id: snapshot.id, itemIds });
    const rails = collectionRails.get(snapshot.id)!;
    const readAll = rails.some((rail) => rail.sorted);
    const chunk = readAll
      ? itemIds.length
      : Math.max(...rails.map((rail) => rail.limit));
    const found: HomeCardSource[] = [];
    for (let offset = 0; offset < itemIds.length; offset += chunk) {
      const batch = itemIds.slice(offset, offset + chunk);
      const unread = batch.filter((id) => !content.has(id));
      if (unread.length) {
        const snapshots = await db().getAll(...unread.map(contentRef));
        reads += snapshots.length;
        for (const item of snapshots) {
          const card = toCardSource(item.id, item.data());
          if (card) content.set(item.id, card);
        }
      }
      found.push(...batch.flatMap((id) => content.get(id) ?? []));
      // Editorial order: the first `limit` matching items are enough.
      if (
        !readAll &&
        rails.every(
          (rail) =>
            found.filter(
              (item) => !rail.contentType || item.type === rail.contentType,
            ).length >= rail.limit,
        )
      )
        break;
    }
  }

  return {
    content: [...content.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    collections,
    banners: bannerSnapshot.docs.flatMap(
      (doc) => toBannerSource(doc.id, doc.data()) ?? [],
    ),
    reads,
  };
}

// ---- Build ----

type FeedBody = {
  language: HomeLanguage;
  isPublished: true;
  schemaVersion: number;
  banners: ReturnType<typeof resolveHomeBanners<Timestamp>>;
  sections: Record<string, unknown>[];
};

function buildFeed(
  language: HomeLanguage,
  layout: HomeLayoutSection[],
  sources: Sources,
  now: number,
): FeedBody {
  const feed: FeedBody = withoutUndefined({
    language,
    isPublished: true,
    schemaVersion: HOME_FEED_SCHEMA_VERSION,
    banners: resolveHomeBanners(sources.banners, language, now),
    sections: buildHomeFeedSections(
      layout,
      sources.content,
      sources.collections,
    ),
  });
  assertRenderable(feed);
  return feed;
}

// The feed must parse with the app's own schema without dropping anything
// it can draw. A failure here is a builder bug: keep the previous feed.
function assertRenderable(feed: FeedBody) {
  const parsed = homeFeedDocumentSchema.safeParse({
    ...feed,
    generatedAt: Timestamp.now(),
  });
  if (!parsed.success || parsed.data.banners.length !== feed.banners.length)
    throw new Error(`Home feed ${feed.language} would not render`);
  for (const section of feed.sections) {
    if (!drawableTypes.has(section.type as string)) continue;
    const result = homeSectionSchema.safeParse(section);
    const items = (section.items as unknown[] | undefined)?.length;
    if (
      !result.success ||
      ("items" in result.data && result.data.items.length !== items)
    )
      throw new Error(
        `Home section ${String(section.id)} (${feed.language}) would not render`,
      );
  }
}

export type HomeLanguageResult = {
  status: "WRITTEN" | "UNCHANGED" | "SKIPPED";
  reason?: string;
  issues?: string[];
  sections: number;
  banners: number;
};
export type HomeFeedBuildResult = {
  status: "BUILT" | "SUPERSEDED";
  reason: string;
  reads: number;
  nextChangeAt: string | null;
  languages: Record<HomeLanguage, HomeLanguageResult>;
};

async function claimBuild(now: number, reason: string) {
  const claimId = `${now}-${randomUUID()}`;
  await homeFeedStateRef().set(
    {
      dirty: false,
      claimId,
      claimedAt: Timestamp.fromMillis(now),
      claimReason: reason,
    },
    { merge: true },
  );
  return claimId;
}

// Claims, reads, builds and writes both languages. Idempotent: a feed whose
// content is unchanged is not rewritten (generatedAt stays), and the same
// sources always give the same feed. `now` decides banner windows.
export async function rebuildHomeFeeds(options: {
  reason: string;
  now?: Date;
  actor?: Actor;
}): Promise<HomeFeedBuildResult> {
  const now = (options.now ?? new Date()).getTime();
  const claimId = await claimBuild(now, options.reason);
  try {
    const layoutSnapshots = await db().getAll(...homeLanguages.map(layoutRef));
    const layouts = new Map(
      homeLanguages.map((language, index) => [
        language,
        parseLayout(layoutSnapshots[index].data()),
      ]),
    );
    const sources = await loadSources(
      [...layouts.values()].flatMap((layout) =>
        layout.ok ? [layout.sections] : [],
      ),
    );
    const feeds = new Map<HomeLanguage, FeedBody>();
    const languages = {} as Record<HomeLanguage, HomeLanguageResult>;
    for (const [language, layout] of layouts) {
      if (!layout.ok) {
        logger.error("Home layout cannot be built; keeping the previous feed", {
          language,
          reason: layout.reason,
          issues: layout.issues,
        });
        languages[language] = {
          status: "SKIPPED",
          reason: layout.reason,
          ...(layout.issues ? { issues: layout.issues } : {}),
          sections: 0,
          banners: 0,
        };
        continue;
      }
      const feed = buildFeed(language, layout.sections, sources, now);
      feeds.set(language, feed);
      languages[language] = {
        status: "UNCHANGED",
        sections: feed.sections.length,
        banners: feed.banners.length,
      };
    }
    const nextChangeAt = nextHomeBannerChange(sources.banners, now);

    const superseded = await db().runTransaction(async (tx) => {
      const [state, ...existing] = await tx.getAll(
        homeFeedStateRef(),
        ...homeLanguages.map(feedRef),
      );
      // Transactions may retry: start from a clean status each attempt.
      for (const language of feeds.keys())
        languages[language].status = "UNCHANGED";
      const audit = (superseded: boolean) => {
        if (options.actor)
          writeAudit(tx, options.actor, {
            action: "home.feed.rebuild",
            entity: "homeFeed",
            entityId: homeLanguages.join(","),
            beforeSummary: null,
            afterSummary: {
              superseded,
              ...Object.fromEntries(
                homeLanguages.map((language) => [
                  language,
                  languages[language].status,
                ]),
              ),
            },
          });
        return superseded;
      };
      // A newer build claimed since: it read fresher sources, let it write.
      if (state.data()?.claimId !== claimId) return audit(true);
      homeLanguages.forEach((language, index) => {
        const feed = feeds.get(language);
        if (!feed) return;
        const { generatedAt: _generatedAt, ...current } =
          existing[index].data() ?? {};
        if (
          existing[index].exists &&
          fingerprint(current) === fingerprint(feed)
        )
          return;
        tx.set(feedRef(language), {
          ...feed,
          generatedAt: Timestamp.fromMillis(now),
        });
        languages[language].status = "WRITTEN";
      });
      tx.set(
        homeFeedStateRef(),
        {
          builtAt: Timestamp.fromMillis(now),
          builtClaimId: claimId,
          nextChangeAt:
            nextChangeAt === null ? null : Timestamp.fromMillis(nextChangeAt),
          lastReads: sources.reads,
        },
        { merge: true },
      );
      return audit(false);
    });
    return {
      status: superseded ? "SUPERSEDED" : "BUILT",
      reason: options.reason,
      reads: sources.reads,
      nextChangeAt: iso(nextChangeAt),
      languages,
    };
  } catch (error) {
    // Keep the change pending so the next scheduled run retries.
    await homeFeedStateRef()
      .set(
        {
          dirty: true,
          dirtyAt: FieldValue.serverTimestamp(),
          dirtyReason: "build failed",
        },
        { merge: true },
      )
      .catch(() => undefined);
    throw error;
  }
}

// Why the scheduled run should rebuild now, or null when the feeds are current.
export function homeRebuildReason(
  state: DocumentData | undefined,
  now: number,
): string | null {
  if (!state) return "INITIAL";
  if (state.dirty === true) return "DIRTY";
  const claimedAt = millis(state.claimedAt);
  if (
    state.claimId &&
    state.claimId !== state.builtClaimId &&
    claimedAt !== undefined &&
    now - claimedAt >= CLAIM_TIMEOUT_MS
  )
    return "UNFINISHED";
  const nextChangeAt = millis(state.nextChangeAt);
  if (nextChangeAt !== undefined && nextChangeAt <= now) return "BANNER_WINDOW";
  const builtAt = millis(state.builtAt);
  if (builtAt === undefined || now - builtAt >= MAX_FEED_AGE_MS) return "STALE";
  return null;
}

export async function runScheduledHomeFeedBuild(now = new Date()) {
  const state = await homeFeedStateRef().get();
  const reason = homeRebuildReason(state.data(), now.getTime());
  if (!reason) return { status: "IDLE" as const };
  return rebuildHomeFeeds({ reason, now });
}

// ---- Home manager callables (doc 09 §6), CONTENT_ADMIN and SUPER_ADMIN ----

const layoutSummary = (
  sections: { id: string; visible: boolean }[],
  revision: number,
) => ({
  revision,
  sections: sections.map(
    (section) => `${section.id}${section.visible ? "" : " (hidden)"}`,
  ),
});

export async function getHomeLayout(actor: Actor, data: unknown) {
  requirePermission(actor, "home.read");
  const { language } = parse(getHomeLayoutSchema, data);
  const [layout, feed, state] = await db().getAll(
    layoutRef(language),
    feedRef(language),
    homeFeedStateRef(),
  );
  const stored = layout.data();
  const parsed = parseLayout(stored);
  const feedData = feed.data();
  const stateData = state.data();
  return {
    language,
    revision: typeof stored?.revision === "number" ? stored.revision : 0,
    // An invalid stored layout is returned as stored so it can be fixed.
    sections: parsed.ok ? parsed.sections : (stored?.sections ?? []),
    valid: parsed.ok || parsed.reason === "MISSING_LAYOUT",
    issues: parsed.ok ? [] : (parsed.issues ?? []),
    updatedAt: iso(stored?.updatedAt),
    updatedBy: (stored?.updatedBy as string | undefined) ?? null,
    feed: feedData
      ? {
          generatedAt: iso(feedData.generatedAt),
          sections: Array.isArray(feedData.sections)
            ? feedData.sections.length
            : 0,
          banners: Array.isArray(feedData.banners)
            ? feedData.banners.length
            : 0,
        }
      : null,
    builder: {
      dirty: stateData?.dirty === true,
      builtAt: iso(stateData?.builtAt),
      nextChangeAt: iso(stateData?.nextChangeAt),
    },
  };
}

// Saves one language's layout (order, visibility, titles, rail sources and
// limits, shortcuts) and rebuilds the feeds at once.
export async function updateHomeLayout(actor: Actor, data: unknown) {
  requirePermission(actor, "home.write");
  const input = parse(updateHomeLayoutSchema, data);
  const sections = withoutUndefined(input.sections);
  const saved = await db().runTransaction(async (tx) => {
    const existing = await tx.get(layoutRef(input.language));
    const stored = existing.data();
    const current = typeof stored?.revision === "number" ? stored.revision : 0;
    if (current !== input.expectedRevision)
      throw new HttpsError(
        "failed-precondition",
        "The layout changed since it was loaded. Reload it and try again.",
        { reason: "REVISION_MISMATCH", revision: current },
      );
    const previous: { id: string; visible: boolean }[] = Array.isArray(
      stored?.sections,
    )
      ? stored.sections
      : [];
    if (existing.exists && fingerprint(previous) === fingerprint(sections))
      return { revision: current, changed: false };
    const revision = current + 1;
    tx.set(layoutRef(input.language), {
      sections,
      revision,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    tx.set(
      homeFeedStateRef(),
      {
        dirty: true,
        dirtyAt: FieldValue.serverTimestamp(),
        dirtyReason: `homeLayout/${input.language}`,
      },
      { merge: true },
    );
    const before = new Map(
      previous.map((section) => [section.id, fingerprint(section)]),
    );
    const changedSections = [
      ...sections
        .filter((section) => before.get(section.id) !== fingerprint(section))
        .map((section) => section.id),
      ...previous
        .filter((section) => !sections.some((value) => value.id === section.id))
        .map((section) => section.id),
    ];
    writeAudit(tx, actor, {
      action: "home.layout.update",
      entity: "homeLayout",
      entityId: input.language,
      beforeSummary: existing.exists ? layoutSummary(previous, current) : null,
      afterSummary: { ...layoutSummary(sections, revision), changedSections },
    });
    return { revision, changed: true };
  });
  if (!saved.changed)
    return { language: input.language, ...saved, rebuild: null };
  let rebuild: HomeFeedBuildResult | { status: "QUEUED" };
  try {
    rebuild = await rebuildHomeFeeds({
      reason: `homeLayout/${input.language}`,
    });
  } catch (error) {
    logger.error("Home feed rebuild after a layout change failed; queued", {
      language: input.language,
      error: error instanceof Error ? error.message : String(error),
    });
    rebuild = { status: "QUEUED" };
  }
  return { language: input.language, ...saved, rebuild };
}

// Builds one language's feed from an unsaved layout for the live preview.
// Nothing is written.
export async function previewHomeFeed(actor: Actor, data: unknown) {
  requirePermission(actor, "home.read");
  const { language, sections } = parse(previewHomeFeedSchema, data);
  const now = Date.now();
  const layout = withoutUndefined(sections);
  const sources = await loadSources([layout]);
  const feed = buildFeed(language, layout, sources, now);
  return {
    language,
    banners: feed.banners.map((banner) => ({
      ...banner,
      startAt: iso(banner.startAt),
      endAt: iso(banner.endAt),
    })),
    sections: feed.sections,
    reads: sources.reads,
  };
}

export async function rebuildHomeFeed(actor: Actor, data: unknown) {
  requirePermission(actor, "home.write");
  parse(rebuildHomeFeedSchema, data);
  return rebuildHomeFeeds({ reason: "MANUAL", actor });
}
