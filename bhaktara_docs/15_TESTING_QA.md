# Testing and QA Plan

## Unit tests

Cover:
- XP table and daily cap (including CAPPED ledger status)
- Level/rank thresholds
- Streak logic with the 04:00 local boundary (D-024): before/after 04:00, timezone change limit, DST-free IST and a non-IST timezone
- Qualifying activities (D-026)
- Session minimum duration
- Challenge progress per metric
- Reward idempotency
- League cohort formation and every row of the promotion/relegation table (doc 10 §5), including tiny cohorts
- Merge rules table (doc 21 §4)
- Rewarded gate logic, including the no-fill fallback
- Ad placement exclusion (C-001)
- Banner/notification route whitelist and fallback
- searchTokens normalization (hanumaan/hanuman/हनुमान)

## Integration tests

Cover: - authentication - Firestore repositories - Cloud Functions -
Storage upload - notification flow - subscription entitlement - offline
sync

## UI tests

Critical flows:
1. Onboarding (language only)
2. Guest session creation and Google sign-in (link path)
3. Sign-in collision (merge path)
4. Home loading and banner navigation (internal targets only)
5. Play bhajan, background playback, lock-screen controls
6. Wallpaper: preview → rewarded ad → set/save (and the no-fill fallback)
7. Ringtone: preview → rewarded ad → set (WRITE_SETTINGS permission flow)
8. Status: play → free WhatsApp share; rewarded save
9. Mandir: choose deity, diya/flowers/bell, aarti, special offering via rewarded ad
10. Sadhana: jaap mala, meditation, prayer checklist, full Sadhana bonus
11. Challenge completion and XP
12. Streak across the 04:00 boundary
13. League board (signed-in) and guest preview
14. Search (Hindi, English, transliterated)
15. Profile, display-name edit, account deletion

## Security tests

-   unauthenticated access
-   unauthorized admin access
-   user-to-user data access
-   XP tampering / direct writes to userStats
-   reward replay
-   jaap session shortcutting (early completeSession)
-   anonymous user writing leagueMembers
-   reading contentPrivate from the client
-   presigned upload URL misuse outside staging/
-   storage path abuse
-   malformed input
-   rate limiting

## Performance

Measure: - cold start - home render - image loading - scrolling - player
startup - download speed - memory usage

Target smooth 60 FPS on representative mid-range devices, and acceptable performance on a low-end device (2–3 GB RAM). V1 test matrix is Android only. The iOS test matrix will be added in the iOS phase (D-009). CI should still type-check shared code, which is platform-neutral.

## Offline tests

Test: - airplane mode - weak network - network switching - interrupted
download - retry - offline cached content - queued progress sync

## Release checklist

-   production Firebase config
-   security rules deployed
-   App Check
-   crash monitoring
-   analytics
-   ads test mode
-   privacy policy
-   account deletion
-   store listing
-   signed release
-   backup
-   rollback plan
