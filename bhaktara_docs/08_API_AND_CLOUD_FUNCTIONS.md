# API and Cloud Functions Specification

> Matches schema v2 (doc 06) and the decision log through D-045.
> **Naming:** callable HTTPS functions (Firebase callable) for client operations. Scheduled functions and Firestore triggers for background work. Cloud Run for media processing.
> **All client callables:** require Firebase Auth (anonymous allowed unless stated), App Check, input schema validation and stable error codes.

## 1. Principle: no generic "award XP" callable

The client never asks for XP. It reports **activities**, and the server decides whether XP is due.

`awardXp` is an internal module used by the functions below. It is not exposed to clients.

**Internal `awardXp(uid, type, sourceId, bhaktiDay)`**
1. Look up the XP value in `appConfig/gamification`.
2. Create `rewardTransactions/{uid}_{type}_{sourceId}` in a transaction. If it already exists, return `ALREADY_REWARDED`.
3. Enforce the daily cap. XP over the cap is recorded with status `CAPPED` and 0 XP granted.
4. Update `userStats` (totalXp, level, rank).
5. If the user is in a league this week, add to `leagueMembers.weeklyXp` (anonymous users never are — D-019).
6. Evaluate badges.
7. Return a reward summary: XP granted, level-up, badges unlocked.

## 2. Client callables

### Practice

| Function | Input | Server behaviour |
|---|---|---|
| `startSession` | `{ type: JAAP\|MEDITATION, targetMalas?, targetMinutes? }` | Creates `users/{uid}/sessions/{id}` with the server start time. Returns `sessionId`. |
| `completeSession` | `{ sessionId, malasCompleted?, minutesCompleted? }` | Rejects if the elapsed server time is below the minimum (60 s/mala; minutes claimed ≤ elapsed). Updates `days`, counters, streak and challenges. Awards XP per doc 10. |
| `completePrayerChecklist` | `{ bhaktiDay }` | Validates the checklist against `appConfig/sadhana`. Marks the task done. Streak, full-Sadhana bonus, challenges, XP. |
| `recordMandirVisit` | `{ deityId }` | Once per `bhaktiDay`: sets `mandirVisited`, updates counters and challenges, 5 XP. |
| `recordContentListen` | `{ contentId, listenedSeconds }` | Counts only if listened ≥ 80% of duration. Capped per day. Affects challenges and `contentStats` only. No direct XP. |

### Profile and settings

| Function | Input | Server behaviour |
|---|---|---|
| `setTimezone` | `{ timezone }` | Validates the IANA name. At most 1 change per 24 h. |
| `updateProfile` | `{ displayName?, photoKey? }` | Name 2–30 letters (any script), profanity filter (Hindi + English + Hinglish list); photo must be the user's own uploaded key. Updates the current week's `leagueMembers` doc. (Was `updateDisplayName`; see the 2026-10-14 checkpoint.) |
| `requestProfilePhotoUpload` | `{ contentType, bytes }` | Presigned R2 PUT for `users/{uid}/photo.*` (JPEG/WebP, ≤ 1 MB, 10 min). |
| `getLeagueBoard` | `{}` | Signed-in only. Returns the cohort board for the current week. May read directly from Firestore instead if rules allow. |

### Accounts (doc 21)

| Function | Input | Server behaviour |
|---|---|---|
| `mergeGuestAccount` | `{ guestIdToken }` | Rules in doc 21 §4. Idempotent through `accountMerges`. |
| `deleteAccount` | `{}` | Re-auth check. Deletes `users/{uid}` and subcollections, `userStats`, `entitlements`, `userChallenges`, `leagueMembers` (current week) and the Auth user. The ledger is anonymized. |

### Streak evaluation

Runs inside every practice function. It is not a separate callable.

```text
if activity qualifies (D-026) and days/{bhaktiDay}.qualifying was false:
    set qualifying = true
    if lastQualifyingDay == bhaktiDay - 1:  currentStreak += 1
    elif lastQualifyingDay == bhaktiDay:    no change
    else:                                   currentStreak = 1
    longestStreak = max(longestStreak, currentStreak)
    lastQualifyingDay = bhaktiDay
```

- `bhaktiDay` is computed server-side from the server time and the stored timezone. It is never taken from client input, except as a consistency check.

## 3. Admin callables (custom claim required; every mutation writes `auditLogs`)

| Function | Role | Purpose |
|---|---|---|
| `requestUploadUrl` | EDITOR+ | Presigned R2 PUT URL for `staging/` (doc 22 A4) |
| `processMedia` (Cloud Run) | EDITOR+ | Validate the file, produce variants, write final keys, update `content.media` |
| `transitionContentStatus` | EDITOR (to READY), CONTENT_ADMIN (to SCHEDULED/PUBLISHED/ARCHIVED) | Enforces D-036 and the checklist completeness |
| `setAdminRole` | SUPER_ADMIN | Set custom claims |
| `sendNotificationNow` | CONTENT_ADMIN | Immediate campaign (still subject to caps) |

- With a single operator, one account will usually hold SUPER_ADMIN. Roles still exist for future staff.

## 4. Triggers and scheduled jobs

| Function | Trigger | Purpose |
|---|---|---|
| `onContentWrite` | Firestore trigger on `content` | Regenerate `searchTokens` (doc 22 B1); mark the home feed dirty |
| `buildHomeFeed` | On dirty flag (debounced) + every 15 min | Write `homeFeeds/{language}` |
| `publishScheduledContent` | Every 5 min | SCHEDULED → PUBLISHED when `scheduledAt ≤ now`; ARCHIVED when `expireAt ≤ now` |
| `weeklyLeagueRollover` | Monday 04:00 IST | Finalize cohorts (doc 10 §5 table), write results and tiers, open the new `leagueWeeks` doc. Batched, idempotent per week. |
| `dailyReminderFanout` | Every 15 min | Users whose local reminder time falls in the window, who have not yet qualified today, and who are under the daily cap (D-043). Sent via FCM. |
| `sendScheduledNotifications` | Every 5 min | Campaigns due: resolve the audience, respect caps and quiet hours, send, record stats |
| `aggregateContentStats` | Daily 03:00 IST | Aggregate listen/save/share events into `contentStats`; recompute `popularityScore` |
| `expireChallenges` | Daily 04:05 IST | Mark `userChallenges` EXPIRED |
| `cleanupAnonymousAccounts` | Daily | Delete anonymous users inactive for more than the configured window (default 90 days) |
| `cleanupMergedGuests` | Daily | Delete data of guests merged more than 7 days ago |

## 5. Idempotency

- Reward functions use the deterministic ledger doc ID (`{uid}_{type}_{sourceId}`).
- `sourceId` examples: `jaap:{sessionId}`, `prayer:{bhaktiDay}`, `mandir:{bhaktiDay}`, `challenge:{challengeId}:{periodKey}`, `badge:{badgeId}`, `fullSadhana:{bhaktiDay}`.
- Scheduled jobs store a run marker, e.g. `leagueWeeks/{weekId}.status`, so a retry does not double-apply.

## 6. Error codes

- `UNAUTHENTICATED`
- `PERMISSION_DENIED`
- `INVALID_ARGUMENT`
- `NOT_FOUND`
- `ALREADY_COMPLETED`
- `ALREADY_REWARDED`
- `SESSION_TOO_SHORT`
- `DAILY_CAP_REACHED`
- `RATE_LIMITED`
- `SIGN_IN_REQUIRED` (league features for anonymous users)
- `INTERNAL`

Never return stack traces or internal messages to clients.

## 7. Rewarded ads (D-038, D-040, D-041)

- Rewarded ads unlock a **save to device** or **one special Mandir offering**. Both are client-side actions, with no XP and no server state.
- AdMob server-side verification (SSV) is not required in V1, because no server-authoritative value is granted.
- If a rewarded ad ever grants XP or an entitlement, SSV becomes mandatory first.

## Implementation checkpoint — 2026-10-05 (Home feed builder)

Implemented in `functions/src/home.ts` and run in the local emulators only (the dev project is on Spark).

**Rebuild trigger: dirty flag + scheduled check.** This is the cheapest design that stays correct:
- `onContentWrite`, `onBannerWrite`, `onCollectionWrite` and `onHomeLayoutWrite` (Firestore triggers, retried) mark `jobState/buildHomeFeed.dirty` only when a write can change a feed: published content entering or leaving PUBLISHED or changing a card or ranking field, active banners, published collections, and layout sections. The trigger reads the flag and writes only if it is not already set, so a burst of writes (an import, the nightly popularity update) costs one write to the hot document.
- `buildHomeFeed` runs **every 5 minutes** instead of rebuilding every 15. An idle run reads only the state document. It rebuilds when the flag is set, when a banner window opens or closes (`nextChangeAt`), when an earlier build never finished, or when the feed is more than 24 hours old (a guard against a missed trigger). The longest delay for a content change is therefore 5 minutes.
- A build first claims the flag (`dirty=false` and a new `claimId`), then reads its sources. A change committed after the claim marks the flag again for the next run. The feed write is a transaction that checks the claim, so a slower, older build never overwrites a newer one. If the build fails, the flag is set again.
- Builds are deterministic and idempotent. A feed whose content has not changed is not rewritten, and its `generatedAt` stays. The feed is validated with the app's `homeFeedDocumentSchema` before it is written.
- Reads are bounded. Each build reads two layouts, at most 100 active banners, one query per distinct (content type, sort) pool with at most 20 documents, and the referenced collections. A collection rail without a sort reads its items in rail-sized chunks; one with a sort reads all of them, up to 200.

**Home manager callables (doc 09 §6).** These need SUPER_ADMIN or CONTENT_ADMIN (`home.read` / `home.write`). Inputs are validated with the Zod schemas in `src/domain/cms.ts` and `src/domain/home.ts`.

| Callable | Input | Result |
|---|---|---|
| `getHomeLayout` | `{ language }` | `{ language, revision, sections, valid, issues[], updatedAt, updatedBy, feed: { generatedAt, sections, banners } \| null, builder: { dirty, builtAt, nextChangeAt } }` |
| `updateHomeLayout` | `{ language, sections, expectedRevision }` | Replaces the language's layout (order, visibility, titles, rail source and limit, shortcuts). `expectedRevision` must match the stored revision (0 when there is no layout yet); otherwise it fails with `failed-precondition` and `{ reason: "REVISION_MISMATCH", revision }`. Writes a `home.layout.update` audit entry in the same transaction, then rebuilds at once. Returns `{ language, revision, changed, rebuild }`. `rebuild` is null when nothing changed, or `{ status: "QUEUED" }` if the immediate build failed and the scheduler will retry. |
| `previewHomeFeed` | `{ language, sections }` | Builds an unsaved layout for the live preview without writing anything. Returns `{ language, banners (ISO dates), sections, reads }`. |
| `rebuildHomeFeed` | `{}` | Forces a rebuild of both languages and writes a `home.feed.rebuild` audit entry. Returns `{ status: BUILT \| SUPERSEDED, reason, reads, nextChangeAt, languages: { hi, en: { status: WRITTEN \| UNCHANGED \| SKIPPED, reason?, sections, banners } } }`. |

When a stored layout is missing or invalid, that language is skipped and its previous feed is kept. Deferred: FESTIVALS resolution, and regenerating `searchTokens` in `onContentWrite` (today the content callables and the importer generate them).

## Implementation checkpoint — 2026-10-05 (habit layer)

Implemented in `functions/src/progression.ts` (Firestore I/O) and `functions/src/progressionEngine.ts` (pure rules), with shared rules and contracts in `src/domain/progression.ts`. Emulator-verified; not yet deployed to `bhaktara-dev`.

| Callable | Input | Notes |
|---|---|---|
| `setTimezone` | `{ timezone, language? }` | Creates `users/{uid}` with default preferences if missing (server-owned profile). A change is accepted at most once per 24 h; a refused change returns the stored zone with `reason: "TIMEZONE_CHANGE_LIMIT"` instead of failing, because the app calls it on every start. |
| `startSession` | `{ sessionId, type: JAAP\|MEDITATION, targetMalas?, targetMinutes?, deityId? }` | The **client generates `sessionId`** (16–64 URL-safe chars), so a retried start returns the existing session. Starting a session makes it the user's only completable session of that type (`userStats.activeSessions`), so parallel sessions cannot multiply credit. Rate limit: 300 starts per practice day. |
| `completeSession` | `{ sessionId, malasCompleted? \| minutesCompleted? }` | Credit is bounded by server time: 60 s per mala, minutes ≤ elapsed (15 s grace for the app's clock). A claim above the bound is reduced; nothing creditable is `SESSION_TOO_SHORT`. Older than 12 h is `SESSION_EXPIRED`; a replaced session is `SESSION_SUPERSEDED`. The result is stored on the session, so **retries return the same result** (or the same rejection). |
| `completePrayerChecklist` | `{ bhaktiDay?, itemIds }` | `itemIds` must cover `appConfig/sadhana.prayerItems` (`CHECKLIST_INCOMPLETE`). The day is the server's; the client day is only logged when it differs. Already done today returns `status: "ALREADY_DONE"`. |
| `recordMandirVisit` (D-058) | `{ deityId?, bhaktiDay? }` | The diya lit in the Mandir tab. First call of the practice day: 5 XP (`rewardTransactions/{uid}_MANDIR_VISIT_{day}`, under the daily cap), `counters.mandirVisits` + 1 (Mandir badges), `days/{day}.mandirVisited` (and `mandirDeityId`), `MANDIR_VISITS` challenges. Returns a `PracticeResult` plus `alreadyCounted: false, mandirVisited: true`. Later calls that day change nothing and return `status: "ALREADY_DONE", alreadyCounted: true`. Not a streak activity by itself (doc 10 §3); a daily challenge it completes qualifies the day. |

Every practice call returns a `PracticeResult`: XP granted, ledger lines (GRANTED/CAPPED), totals, level and rank (with level-up/rank-up flags), streak, today's tasks, completed challenges and unlocked badges. The app shows it without another read.

- **Transaction:** one Firestore transaction per practice call reads the session, profile, `userStats`, the day, the user's challenge progress and the candidate ledger documents, then writes all changes. Rejections are committed (the session is marked REJECTED) and thrown after the transaction.
- **Reasons** travel in `HttpsError.details.reason` (`SESSION_TOO_SHORT`, `SESSION_EXPIRED`, `SESSION_SUPERSEDED`, `SESSION_TYPE_MISMATCH`, `RATE_LIMITED`, `CHECKLIST_INCOMPLETE`).
- **Daily cap:** XP beyond 300 is logged with status `CAPPED`; a reward that partly fits is granted up to the cap.
- **Config:** `appConfig/gamification` and `appConfig/sadhana` are cached per instance for 60 s (not in the emulator); missing or invalid documents fall back to the doc 10 defaults with an error log.
- **`expireChallenges`** runs daily at 04:05 IST and marks ended ACTIVE `userChallenges` as EXPIRED (index `status` + `expiresAt`).
- Deferred to M3: `recordContentListen`, weekly league XP. (`recordMandirVisit` added 2026-10-14, D-058.)

## Implementation checkpoint — 2026-10-14 (profile and account)

Contracts are in `src/domain/account.ts`, the client is in `src/repositories/accountRepository.ts`, and the rules are in doc 21's 2026-10-14 checkpoint. Errors are `HttpsError`s with `details.reason`.

| Callable | Input | Result | Errors (code / reason) |
|---|---|---|---|
| `updateProfile` (guests allowed) | `{ displayName?, photoKey?: string \| null }`, at least one, strict | `ProfileResult { displayName, photoKey }` | `invalid-argument` (schema, issues[]) · `invalid-argument` / `DISPLAY_NAME_NOT_ALLOWED` · `resource-exhausted` / `RATE_LIMITED` (more than 5 name changes per practice day) · `invalid-argument` / `PHOTO_KEY_INVALID` (not `users/{uid}/photo.{hex16}.{jpg\|webp}`) · `failed-precondition` / `PHOTO_NOT_UPLOADED` · `invalid-argument` / `PHOTO_TOO_LARGE` · `invalid-argument` / `PHOTO_TYPE_INVALID` · `failed-precondition` / `UPLOADS_NOT_CONFIGURED` |
| `requestProfilePhotoUpload` (guests allowed) | `{ contentType: image/jpeg \| image/webp, bytes: 1..1048576 }`, strict | `ProfilePhotoUpload { key, uploadUrl, headers: { Content-Type, Cache-Control }, expiresAt }` (10 min) | `invalid-argument` (schema) · `resource-exhausted` / `RATE_LIMITED` (more than 10 per practice day) · `failed-precondition` / `UPLOADS_NOT_CONFIGURED` |
| `mergeGuestAccount` (non-anonymous only) | `{ guestIdToken }` (20–8192 chars), strict | `MergeSummary { alreadyMerged, xpAdded, badgesAdded, favoritesAdded, daysAdded }` | `permission-denied` / `SIGN_IN_REQUIRED` · `invalid-argument` (schema) · `invalid-argument` / `GUEST_TOKEN_INVALID` · `invalid-argument` / `GUEST_TOKEN_EXPIRED` · `failed-precondition` / `GUEST_NOT_ANONYMOUS` · `invalid-argument` / `SAME_ACCOUNT` · `not-found` / `GUEST_NOT_FOUND` · `failed-precondition` / `ALREADY_MERGED_ELSEWHERE` |

- The upload URL signs `Content-Type`, `Content-Length` (= `bytes`) and `Cache-Control`. The app must PUT a body of exactly `bytes` bytes with exactly the returned headers.
- `cleanupMergedGuests` is implemented (daily 03:30 IST; merges older than 7 days; at most 50 per run).
- The moderator `resetDisplayName` (admin `moderateUser`) now also clears the name on running league rows.
- `updateProfile`, `requestProfilePhotoUpload` and `cleanupMergedGuests` bind the R2 secrets like the asset callables (`R2_UPLOAD_SECRETS=true`). Without R2 configuration, photo calls answer `UPLOADS_NOT_CONFIGURED`, and name changes still work.
