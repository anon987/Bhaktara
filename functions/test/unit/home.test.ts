// Unit tests for the Home feed trigger filter and the scheduled rebuild
// decision. Pure: no emulator and no Firestore calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { affectsHomeFeed, homeRebuildReason } from "../../src/home";

const published = {
  status: "PUBLISHED",
  type: "BHAJAN",
  title: { en: "Bhajan", hi: "भजन" },
  description: { en: "One", hi: "एक" },
  media: {
    thumb: { key: "bhajan/a/thumb.webp" },
    stream: { key: "bhajan/a/stream.m4a" },
  },
  popularityScore: 3,
  publishedAt: Timestamp.fromMillis(1_000),
  tags: ["a"],
};

test("content writes mark Home dirty only when a feed can change", () => {
  const changed = (before?: object, after?: object) =>
    affectsHomeFeed("content", before, after);
  const draft = { ...published, status: "DRAFT" };
  assert.equal(changed(undefined, draft), false);
  assert.equal(
    changed(draft, { ...draft, title: { en: "x", hi: "y" } }),
    false,
  );
  assert.equal(changed(draft, published), true);
  assert.equal(changed(published, { ...published, status: "ARCHIVED" }), true);
  assert.equal(changed(published, undefined), true);
  // Fields the feed never shows are ignored, even when live.
  assert.equal(
    changed(published, {
      ...published,
      tags: ["b"],
      description: { en: "Two", hi: "दो" },
      media: { ...published.media, stream: { key: "bhajan/a/v2.m4a" } },
      updatedAt: Timestamp.now(),
    }),
    false,
  );
  // Same values in another key order and a fresh Timestamp instance.
  assert.equal(
    changed(published, {
      ...published,
      title: { hi: "भजन", en: "Bhajan" },
      publishedAt: Timestamp.fromMillis(1_000),
    }),
    false,
  );
  for (const edit of [
    { popularityScore: 4 },
    { title: { en: "New", hi: "भजन" } },
    { media: { thumb: { key: "bhajan/a/thumb2.webp" } } },
    { publishedAt: Timestamp.fromMillis(2_000) },
    { durationSeconds: 60 },
  ])
    assert.equal(changed(published, { ...published, ...edit }), true);
});

test("banner, collection and layout writes", () => {
  assert.equal(
    affectsHomeFeed("banners", undefined, { isActive: false }),
    false,
  );
  assert.equal(
    affectsHomeFeed("banners", { isActive: false }, { isActive: true }),
    true,
  );
  assert.equal(affectsHomeFeed("banners", { isActive: true }, undefined), true);
  assert.equal(
    affectsHomeFeed(
      "collections",
      { isPublished: false },
      { isPublished: false },
    ),
    false,
  );
  assert.equal(
    affectsHomeFeed(
      "collections",
      { isPublished: true },
      { isPublished: true },
    ),
    true,
  );
  const sections = [{ id: "a", type: "PROGRESS", order: 1, visible: true }];
  assert.equal(
    affectsHomeFeed(
      "homeLayout",
      { sections, revision: 1 },
      { sections, revision: 2 },
    ),
    false,
  );
  assert.equal(
    affectsHomeFeed(
      "homeLayout",
      { sections },
      { sections: [{ ...sections[0], visible: false }] },
    ),
    true,
  );
});

test("the scheduled run rebuilds only when needed", () => {
  const now = Date.UTC(2026, 9, 5, 12);
  const at = (offset: number) => Timestamp.fromMillis(now + offset);
  const built = {
    dirty: false,
    claimId: "c1",
    builtClaimId: "c1",
    claimedAt: at(-60_000),
    builtAt: at(-60_000),
    nextChangeAt: at(3_600_000),
  };
  assert.equal(homeRebuildReason(undefined, now), "INITIAL");
  assert.equal(homeRebuildReason(built, now), null);
  assert.equal(homeRebuildReason({ ...built, dirty: true }, now), "DIRTY");
  assert.equal(
    homeRebuildReason({ ...built, nextChangeAt: at(0) }, now),
    "BANNER_WINDOW",
  );
  assert.equal(homeRebuildReason({ ...built, nextChangeAt: null }, now), null);
  assert.equal(
    homeRebuildReason({ ...built, builtAt: at(-25 * 3_600_000) }, now),
    "STALE",
  );
  // A claim that never finished: wait for a running build, then retry.
  const running = { ...built, claimId: "c2", claimedAt: at(-30_000) };
  assert.equal(homeRebuildReason(running, now), null);
  assert.equal(
    homeRebuildReason({ ...running, claimedAt: at(-6 * 60_000) }, now),
    "UNFINISHED",
  );
});
