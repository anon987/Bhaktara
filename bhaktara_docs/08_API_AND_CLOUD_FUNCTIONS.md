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
| `updateDisplayName` | `{ displayName }` | 2–24 characters, profanity filter (Hindi + English + Hinglish list). Updates the current week's `leagueMembers` doc. |
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
