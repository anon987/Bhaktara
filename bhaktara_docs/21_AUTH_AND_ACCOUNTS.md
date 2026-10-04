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
