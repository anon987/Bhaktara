# Firestore Data Model (v2)

> Rewritten to match `00_DECISION_LOG.md` through D-045.
>
> **Conventions**
> - Localized text is a map `{ hi, en }` (more languages later).
> - Timestamps are Firestore `Timestamp`.
> - `bhaktiDay` is a `YYYY-MM-DD` string computed with the 04:00 local boundary (D-024).
> - Media fields store asset keys, never URLs (D-031, doc 22).
>
> **Write access legend:** **[owner]** user may write within rules · **[server]** Cloud Functions only · **[admin]** CMS (custom claims) · **[public-read]** readable by any authenticated session (including anonymous)

## Media object (embedded type)

```text
MediaVariant { key, bytes, mime, width?, height?, durationSeconds?, bitrate? }
Media        { [variantName]: MediaVariant }   // thumb | mobile | full | stream | file | video720 | poster
```

---

## 1. Users

Split by ownership so that security rules stay simple.

### users/{uid} — [owner, limited fields]

```text
displayName          // league/profile name, editable (D-042); default = first name + last initial
photoUrl
language             // "hi" | "en"
mandirDeityId
notificationPreferences { dailyReminder: bool, reminderTime: "HH:mm", newContent: bool,
                          festivals: bool, league: bool }
createdAt            [server]
lastActiveAt         [server]
isAnonymous          [server]
timezone             [server]   // IANA; set via setTimezone function, at most 1 change/24h
```

- Owner-writable: `language`, `mandirDeityId`, `notificationPreferences`, `photoUrl`.
- `displayName` is changed through `updateDisplayName`, which applies a profanity filter and length limits and updates league denormalizations.
- There is no `isAdmin` field. Authorization uses custom claims only.

### userStats/{uid} — [server], owner can read

```text
totalXp, level, rank                  // rank: JIGYASU|SADHAK|BHAKT|ANANYA_BHAKT|PARAM_BHAKT
currentStreak, longestStreak, lastQualifyingDay
dailyXp { day, xp }                   // cap enforcement (doc 10)
leagueTier                            // BRONZE|SILVER|GOLD|DIAMOND|DIVINE|null (null = never joined)
counters { malas, meditationMinutes, mandirVisits, challengesCompleted, fullSadhanaDays }
flags { suspicious: bool, reason? }
updatedAt
```

### entitlements/{uid} — [server], owner can read

For the future subscription; the structure exists from V1.

```text
subscriptionPlan, subscriptionStatus, subscriptionProvider, entitlementVersion, expiresAt
```

### users/{uid}/days/{bhaktiDay} — [server], owner can read

```text
qualifying: bool
xp
tasks { jaap: bool, meditation: bool, prayer: bool }
fullSadhana: bool
malas, meditationMinutes
mandirVisited: bool
```

Used by the History heatmap and streak logic.

### users/{uid}/sessions/{sessionId} — [server]

```text
type: JAAP | MEDITATION
startedAt (server time)
targetMalas? | targetMinutes?
status: OPEN | COMPLETED | REJECTED
completedAt?
```

### users/{uid}/favorites/{contentId} — [owner]

```text
contentId, type, createdAt
```

### users/{uid}/badges/{badgeId} — [server], owner can read

```text
badgeId, unlockedAt
```

### users/{uid}/devices/{installationId} — [owner]

```text
fcmToken, appVersion, language, timezone, updatedAt
```

### userChallenges/{uid}_{challengeId} — [server], owner can read

```text
uid, challengeId, period, progress, target, status (ACTIVE|COMPLETED|EXPIRED), startedAt, completedAt, rewarded
```

---

## 2. Content

### content/{contentId} — [admin write], [public-read only when status == PUBLISHED]

```text
type                 // BHAJAN | AARTI | MANTRA | CHALISA | WALLPAPER | RINGTONE | STATUS  (V1 — D-004, D-045)
status               // DRAFT | READY | SCHEDULED | PUBLISHED | ARCHIVED (D-036)
title {hi,en}
description {hi,en}
slug
audioLanguage?       // e.g. "hi", "sa" (audio types)
deityIds[]
categoryIds[]
tags[]               // operator-entered, includes transliterations
searchTokens[]       [server]   // generated on publish (doc 22)
media: Media
durationSeconds?
isFeatured
isPremium            // false in V1; reserved
saveGate             // REWARDED | FREE  (default REWARDED for WALLPAPER/RINGTONE/STATUS — D-038, D-041)
isShareable
adEligible
scheduledAt?
publishedAt?
expireAt?
popularityScore      [server]   // recomputed daily
updatedAt
```

- Counters are NOT stored on this doc. The client never writes to it.

### contentPrivate/{contentId} — [admin only, not public]

Provenance and QA data (P-04 resolved here).

```text
importKey
sourceText           // verbatim Devanagari used for generation (sacred text types)
sourceTextRef        // named public-domain edition / tradition reference
aiTool, aiPlan, licenseRecordId, generatedAt
checklist { ...doc 12 §5 items: bool }
createdBy, updatedBy, createdAt
```

### contentStats/{contentId} — [server]

```text
plays, completes, saves, shares, favorites (daily aggregates + totals), lastAggregatedAt
```

### licenseRecords/{id} — [admin only]

```text
tool, plan, capturedAt, clauseText, evidenceKey
```

### deities/{deityId} — [admin write], [public-read]

```text
name {hi,en}, aliases[], description {hi,en}, media (thumb, mobile)
isMandirEnabled, mandirArt: Media, sortOrder, isActive
```

### categories/{categoryId} — [admin], [public-read]

```text
name {hi,en}, slug, contentType, iconKey, sortOrder, isActive
```

### collections/{collectionId} — [admin], [public-read when published]

```text
title {hi,en}, description {hi,en}, cover: Media, itemIds[] (≤ 200; else items subcollection)
isFeatured, isPublished, sortOrder
```

### festivals/{festivalId} — [admin], [public-read when published]

Dates are entered manually (D-034).

```text
name {hi,en}, date "YYYY-MM-DD", endDate?, description {hi,en}, media, deityIds[], collectionId?
isFeatured, isPublished
```

---

## 3. Home and banners

### banners/{bannerId} — [admin], [public-read]

```text
title {hi,en}, subtitle {hi,en}, ctaText {hi,en}, image: Media
target { route, params }     // INTERNAL only (D-015); route must be in the route whitelist (doc 03 §9)
priority, startAt, endAt, isActive, languages[]
```

### homeLayout/{language} — [admin]

```text
sections[] { id, type, title {hi,en}?, source { collectionId? | contentType? | sort? }, limit, visible, order }
```

- `type` whitelist: `BANNERS` (fixed first), `PROGRESS`, `SHORTCUTS`, `SADHANA`, `CHALLENGES`, `LEAGUE`, `FESTIVALS`, `RAIL`, `QUOTE`.

### homeFeeds/{language} — [server], [public-read]

Precomputed by `buildHomeFeed`. It contains resolved banners, rails (card-level fields only) and festivals.

### shortcuts — stored inside homeLayout (`SHORTCUTS` section items)

```text
items[] { label {hi,en}, iconKey, target { route, params } }
```

---

## 4. Mandir

### mandirOfferings/{offeringId} — [admin], [public-read]

D-040.

```text
name {hi,en}
kind            // DIYA | FLOWER | ORNAMENT | OTHER
media           // art/animation assets
unlock          // FREE | REWARDED_SINGLE_USE
deityIds[]      // empty = all deities
availableFrom?, availableTo?     // e.g. festival-only items
sortOrder, isActive
```

- Basic diya, flowers and bell are FREE and always available.
- Special offerings are REWARDED_SINGLE_USE: one rewarded ad unlocks one use. No persistence or inventory is needed.

---

## 5. Gamification

### challenges/{challengeId} — [admin], [public-read]

```text
title {hi,en}, description {hi,en}, period DAILY|WEEKLY, metric, filters{ contentType?, deityId?, collectionId? }
targetValue, xpReward, badgeId?, startAt, endAt, audience ALL|SIGNED_IN, isActive
```

### badges/{badgeId} — [admin], [public-read]

```text
name {hi,en}, description {hi,en}, iconKey, criteriaType, criteriaValue, xpReward, rewardFrameId?, isActive
```

### frames/{frameId} — [admin], [public-read]

```text
name {hi,en}, media, unlockType RANK|BADGE, unlockValue
```

### rewardTransactions/{uid}_{type}_{sourceId} — [server]

The doc ID enforces uniqueness.

```text
uid, type, sourceId, xp, bhaktiDay, createdAt, status (GRANTED|CAPPED|REJECTED)
```

### leagueWeeks/{weekId} — [server], [public-read]

```text
startAt, endAt (Mon 04:00 IST boundaries), status OPEN|FINALIZING|CLOSED
```

### leagueCohorts/{cohortId} — [server], [public-read to signed-in]

```text
weekId, tier, size, status
```

### leagueMembers/{weekId}_{uid} — [server], [public-read to signed-in]

```text
weekId, cohortId, uid, tier, displayName, photoUrl, level (denormalized)
weeklyXp, xpReachedAt, result? (PROMOTED|STAYED|RELEGATED), finalRank?
```

- Board query: `where cohortId == X orderBy weeklyXp desc, xpReachedAt asc` (≤ 30 docs).

---

## 6. Operations and config

### notifications/{campaignId} — [admin]

```text
title {hi,en}, body {hi,en}, image?: Media, target { route, params }, audience { segment, languages[] }
scheduledAt, status DRAFT|SCHEDULED|SENDING|SENT|CANCELLED, stats { targeted, sent, failed, opened }
```

### adPlacements/{placementId} — [admin], [public-read]

```text
enabled, format NATIVE|BANNER|REWARDED, screen, position, frequency, cooldownSeconds,
minActionsBeforeShow, premiumDisabled, countryRules, excludedZones[]   // C-001
```

### appConfig/{docId} — [admin], [public-read unless marked server]

- `app` — minimum app version, maintenance flag, `mediaBaseUrl`
- `gamification` — doc 10 values (versioned)
- `sadhana` — default daily plan: jaap target malas, meditation minutes, prayer checklist items {hi,en}
- `notifications` — caps, quiet hours

### accountMerges/{guestUid} — [server]

```text
targetUid, status, summary, createdAt
```

### auditLogs/{id} — [server/admin write-only], [admin read]

```text
adminUid, action, entity, entityId, beforeSummary, afterSummary, createdAt
```

---

## Removed from v1 of this schema

| Removed | Reason |
|---|---|
| `users.isAdmin` | Custom claims only |
| `users.punyaPoints`, `challenges.punyaReward`, ledger `punya` | D-023 |
| XP/streak/subscription fields on `users` | Moved to `userStats` / `entitlements` |
| Counters on `content` | Moved to `contentStats` (server) |
| `content.previewUrl`, `mediaUrl`, `thumbnailUrl` | Replaced by the `media` asset-key object |
| `rashifal`, `panchang` | D-005, D-033 |
| `sadhanas`, `userSadhanas` (multi-day programs) | Post-V1. V1 uses one daily plan from `appConfig/sadhana` |
| Banner `targetType YOUTUBE` | D-015 |
| `userBadges` top-level | Moved to `users/{uid}/badges` |

## Rules

- Never trust client-supplied XP, streaks, counters, ranks, league results or reward eligibility.
- Every new field requires updates to: this doc, security rules, TypeScript types, repositories and the affected functions.

## Implementation checkpoint — 2026-10-04

The emulator catalog adapter validates and reads the documented `content`, `deities`, and `banners` fields; it adds no collections or stored fields. Content IDs come from document IDs. Search uses `status == PUBLISHED`, superseding the stale isPublished example in doc 22. Test seeding upserts synthetic catalog records only; no production data is written. Remaining schema collections are not yet fully integrated into the app.
