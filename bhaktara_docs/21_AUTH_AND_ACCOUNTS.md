# Authentication and Accounts

> Decisions: D-009, D-016, D-017, D-019, D-020, D-021.
> Tags: **[Decided]** · **[Rec default — adjustable]**

## 1. Identity model [Decided]

- The Firebase Auth UID is the canonical identity everywhere: Firestore keys, ledger, analytics user ID, league membership.
- Never key data by email or phone number.

**Providers in V1**
- Anonymous (guest)
- Google

**Later**
- Phone, added by linking to the existing account (UID unchanged). Never exposed in V1.

**Not used**
- Email/password.

## 2. Guest (anonymous) accounts [Decided: D-016]

- On first launch, the app calls `signInAnonymously()` silently. Every user therefore has a UID from the first session.
- Guests can use every V1 feature except leagues (D-019): content, Sadhana, jaap, XP, streak, challenges, badges, favorites and Virtual Mandir.
- All progression is still server-authoritative: guests go through the same Cloud Functions and ledger as signed-in users.

**Data-loss caveat**
- If a guest uninstalls the app or clears app data, the anonymous session and its progress are lost.
- Soft reminders (§5) must say this plainly, for example:
  "Sign in karein taaki phone badalne ya app hatane par bhi aapki progress surakshit rahe."

## 3. Guest → Google upgrade flow [Decided]

```text
User taps "Google se sign in"
  → Google Sign-In (Android Credential Manager) → Google credential
  → currentUser.linkWithCredential(credential)
      ├─ SUCCESS: same UID, now non-anonymous. Done.
      │   Eligible for leagues from the next league week.
      └─ ERROR auth/credential-already-in-use   (Google account already has Bhaktara data)
          1. guestIdToken = currentUser.getIdToken()   ← capture BEFORE switching
          2. signInWithCredential(credential)          ← now signed in as the existing account
          3. call mergeGuestAccount({ guestIdToken })
          4. show a summary: "Aapki guest progress aapke account mein jod di gayi"
```

If step 3 fails:
- Keep the guest ID token and the pending-merge flag in local storage.
- Retry on the next launch.
- A merge must never be silently dropped.

## 4. Merge rules [Decided: D-020]

`mergeGuestAccount` runs server-side.

**Checks before merging**
1. Verify `guestIdToken` with the Admin SDK.
2. Confirm the token belongs to an anonymous user.
3. Confirm the guest UID is different from the caller's UID.

**Idempotency**
- Use `accountMerges/{guestUid}`.
- A second call returns the stored result instead of merging again.

| Data | Rule |
|---|---|
| XP / totalXp | Add guest ledger entries whose `(type, sourceId)` is not already in the account ledger. Recompute level. |
| Current streak | `max(guest, account)` |
| Longest streak | `max(guest, account)` |
| Last qualifying date | `max(guest, account)` |
| Badges | Union. No second XP reward for a badge the account already owns. |
| Favorites | Union |
| Sadhana history | Union. If the same Sadhana/task exists on the same day in both, keep one. |
| User challenges | Per challenge: keep higher progress. Completed if either completed. Reward is never granted twice. |
| League placement | Account's placement (guests are never in leagues) |
| Weekly league XP | **[Rec default]** Guest XP counts toward lifetime totals only, not the current league week. This prevents farming XP as a guest and merging it in. |
| Profile (name, photo, language) | Keep the account's values. Use the guest's language setting only if the account has none. |
| Notification preferences | Keep the account's values |
| FCM device token | Re-register the current device to the account |

**After a successful merge**
- Mark guest data as merged.
- Delete the anonymous Auth user.
- Delete or expire the guest's Firestore documents with a scheduled cleanup.
- Write an audit/ledger record.

## 5. Soft sign-in reminders [Decided: never forced — D-021]

**Moments [Rec default — adjustable from Remote Config]**
1. After the first completed Sadhana: dismissible card.
2. At streak day 3 and day 7: "Apni streak surakshit karein".
3. When the user opens the Leagues screen: preview + sign-in CTA. This is the one gated feature.
4. A persistent, low-key banner in Profile.

**Caps**
- At most one reminder per day.
- After 3 dismissals, pause reminders for 7 days.
- Never interrupt Sadhana, jaap, audio playback or the Mandir.

## 6. Sign-out

- On sign-out: clear local user caches, then create a new anonymous session.
- The previous account's data stays on the server and returns when the user signs in again.

## 7. Account deletion

This is a Play Store requirement.

- Available in-app (Settings → Account → Delete account), plus a public web URL for deletion requests.
- `deleteAccount` function:
  1. re-authentication check
  2. delete user-owned documents and the ledger (or anonymize it for aggregate stats)
  3. remove from leagues
  4. delete the Auth user
- Must complete within the period stated in the privacy policy.

## 8. Anonymous account cleanup [Rec default]

- A scheduled function deletes anonymous users (and their data) inactive for 90+ days.
- This controls storage and user count.
- The window is configurable.

## 9. Phone auth later

- Add phone by calling `linkWithCredential(PhoneAuthProvider credential)` on the signed-in account. The UID is unchanged.
- Collision handling follows the same pattern as §3.
- SMS cost and abuse protection (App Check, rate limits) must be reviewed before enabling.

## 10. iOS phase note (D-009)

- When iOS launches, Sign in with Apple will likely be required alongside Google (App Store guidelines).
- The auth layer must stay provider-agnostic. Linking and merge (§3–4) must work for any OAuth provider, not only Google.
- Apple sign-in on Android is optional.

## 11. Security notes

- Anonymous and Google users share the same security rules, except where leagues require `request.auth.token.firebase.sign_in_provider != 'anonymous'`.
- The merge function never trusts a client-supplied UID. It only trusts the verified guest ID token.

## Implementation checkpoint — 2026-10-04

Optional emulator mode now silently creates an anonymous Firebase session after restoring persisted auth, with a single in-flight initialization and retry after errors. Native persistence uses AsyncStorage; browser persistence uses local storage. Fixture mode still creates no account. Google linking/merge, server profiles, sign-out/account deletion, and cloud environments remain pending. Local practice/favorites have not been migrated to account-owned server storage.

## Implementation checkpoint — 2026-10-05 (favorites)

With a backend session (emulator/cloud, guests included), favorites live in `users/{uid}/favorites/{contentId}` and device storage is the cache. Toggles update the cache at once and go through a durable, per-item coalesced queue (AsyncStorage `bhaktara.favorites.sync.v1`) that retries with backoff and survives restarts. Writes are idempotent: the doc ID is the content ID, a repeat create is detected by reading the doc back, deletes of missing docs succeed. On an account's first session the device's favorites are added once; drafts and unknown IDs are dropped from the cache. The account list (newest first) is mirrored into the cache on start, on return to foreground and when Profile opens (throttled to once a minute). A queue left by a different UID is discarded rather than sent; guest→Google merge of favorites (union, §4) stays with the server merge (D-017). Fixture mode is unchanged and device-only.

## Implementation checkpoint — 2026-10-14 (profile and guest merge, server)

Implemented in `functions/src/profile.ts`, `functions/src/profanity.ts`, `functions/src/accountMerge.ts` and `functions/src/mergeRules.ts` (pure rules), with the contracts in `src/domain/account.ts` and a typed client in `src/repositories/accountRepository.ts`. Emulator-verified; not yet deployed. App screens (Profile edit, sign-in collision flow) are separate work.

**Profile (D-042).** `updateProfile` (guests allowed) changes the name and/or photo. Names follow `displayNameSchema` (2–30 letters in any script), are whitespace-collapsed and NFC-normalized, and pass a server-side filter (English, Devanagari Hindi and Hinglish abuse, plus names posing as Bhaktara staff), matched case- and diacritic-insensitively with Cyrillic/Greek look-alikes mapped to Latin. Short words are matched as whole words only, so names like Gandhi or Shitala are not blocked. At most 5 name changes per practice day. A photo is uploaded with `requestProfilePhotoUpload` (signed R2 PUT, 10 minutes, at most 10 per day) and then saved with `updateProfile({ photoKey })`, which accepts only this user's `users/{uid}/photo.*` key after checking in R2 that it exists, is at most 1 MB, and is a JPEG/WebP both by stored type and by its first bytes. `photoKey: null` removes the photo; the replaced object is deleted best-effort. Every change writes an `auditLogs` entry (`profile.update`) and updates running league rows.

**Merge (§3–4).** `mergeGuestAccount` follows §4. The caller must be non-anonymous; the guest UID comes only from the verified ID token, which must be anonymous and differ from the caller. `accountMerges/{guestUid}` is claimed first. The copy runs in batches of 150, each in a transaction that re-reads the merge record, writes only what the account lacks, and records what it wrote in the record, so a failed call can simply be repeated. A final transaction then applies XP, level, streaks, counters and badges to `userStats` once and stores the summary. A call after that returns the stored summary with `alreadyMerged: true`, and a different account gets `ALREADY_MERGED_ELSEWHERE`. Choices made where §4 is silent:
- XP: guest ledger entries whose `(type, sourceId)` the account lacks are copied (CAPPED entries included, at 0 XP). The daily cap is not re-applied to past days. If the account's current cap day received merged XP, that XP counts toward today's cap.
- Streaks: max of current, longest and last qualifying day. A current streak only counts if it is still running at the merged last day, so a lapsed account streak is never revived.
- Days: tasks, full Sadhana, Mandir visit and Brahma Muhurta are ORed and counted once. Malas, minutes and the rewarded counts add up. Day XP is the account's plus the guest XP copied for that day. Counters grow by exactly what the merged days added. No new XP (for example a full-Sadhana bonus completed only by the union) is granted.
- Challenges: higher progress; completed and rewarded if either side was; earliest completion kept. The reward is the CHALLENGE ledger entry, copied only if the account lacks it.
- Profile: the account keeps its name, photo and notification preferences. The guest's language, and also its Mandir deity, are used only where the account has none. An account with no profile yet is created from the guest's preferences (but without the guest's name or photo).
- A guest's suspicious flag carries over (`GUEST_<reason>`).
- Afterwards the guest profile gets `mergedInto`, the anonymous Auth user is deleted (retried by a repeat call and by the cleanup), an `account.mergeGuest` audit entry is written, and `cleanupMergedGuests` (daily 03:30 IST) deletes the guest's documents, ledger lines and photo after 7 days.

Not done here: re-registering the device's FCM token (the app writes `users/{uid}/devices`), the app-side pending-merge retry, and leagues themselves (merged XP is marked `mergedFrom` so a league week never counts it). The guest ID token lives one hour. A retry after that fails with `GUEST_TOKEN_EXPIRED` unless the merge had already been claimed, so the app should retry promptly, for example on the next foreground.
