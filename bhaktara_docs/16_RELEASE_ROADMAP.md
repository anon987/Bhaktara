# Release Roadmap

> The first public release is **V1**, which combines the content, habit, competition and ads layers (D-002).
> The milestones below are **internal build stages**. Only M5 is a public release.
> Scope details live in `02_PRODUCT_SCOPE.md`.

## Implementation checkpoint — 2026-10-04

The UI foundation and local practice previews are implemented across the app, with startup storage recovery, 24 passing tests, six passing browser smoke flows, and a verified ARM64 debug build/install/launch on Samsung SM_E076B. These previews do not mark the production milestones below complete: Firebase/auth, real media, CMS, server progression, leagues, notifications, and monetization remain unconnected. The next checkpoint adds emulator-only anonymous auth and Firestore catalog/search, security rules/indexes, seed tooling, and emulator CI. No real Firebase project is configured; production milestones remain incomplete. Native interaction testing of the new backend mode is next. See [current progress](../docs/PROGRESS.md) and [verification evidence](../docs/verification/RESULTS.md) before continuing implementation.

## M0 — Foundation
- Repository setup
- React Native + TypeScript (strict mode), Android-first. Keep the `ios/` project and set up the platform service interfaces (doc 05).
- Navigation shell
- Theme and design tokens
- Hindi/English i18n framework
- Firebase environments: dev, staging, prod
- Authentication (scheme to be decided in Round 4)
- Analytics service
- Crashlytics
- Remote Config
- App Check (monitor mode)
- Core components
- CI
- MCP setup (doc 23): Stitch, Firebase and Cloudflare servers; `.mcp.json` with environment-variable secrets; dev/staging/prod Firebase projects and R2 buckets; R2 CORS, custom domain, cache and lifecycle rules
- Design: export Stitch `DESIGN.md` → theme tokens

## M1 — Content core + CMS core
- **App:** Home (CMS-driven sections), Explore, content detail, audio player, status video player, search, favorites, save/set wallpaper, save/set ringtone
- **Admin:** auth/roles, content CRUD, media upload pipeline (image variants, audio normalization, video renditions), banner manager, home section manager, audit log
- **Seed:** initial catalog (targets in `18_DATA_SEEDING_PLAN.md`)

## M2 — Habit layer
- Sadhana: daily plan, jaap, meditation timer, prayer checklist, history
- XP, levels, streak (server-authoritative), daily and weekly challenges, badges
- Reward ledger and idempotent Cloud Functions
- **Admin:** challenge and badge managers

## M3 — Competition, Mandir, utilities, notifications
- Weekly leagues with promotion/relegation. Activation strategy **[Pending: P-01]**.
- Virtual Mandir (simple)
- Festival list (manual dates — D-034)
- FCM notifications: daily reminder, new content, festival, league ending
- **Admin:** festival manager, Mandir deity config, notification manager

## M4 — Monetization + hardening
- AdMob native and banner placements
- Admin ad controls and Remote Config kill switch
- Security rules review and emulator tests
- App Check enforcement
- Performance pass on low/mid-range Android devices
- Offline and weak-network states
- Privacy policy, account deletion, Data Safety form
- Play Console closed testing track (including any tester requirements that apply to the developer account)

## M5 — V1 public launch
- Staged rollout on Play Store
- Start paid acquisition only after crash-free rate and D1 retention are verified at small spend. Thresholds to be set in the analytics round.

## V1.x
- Name ringtones (D-008)

## iOS phase (later — D-009)

Start after the Android app shows traction and revenue.
- Add Sign in with Apple.
- Add iOS implementations of the platform services (with ringtone and wallpaper fallbacks).
- Configure APNs and ATT.
- Add the iOS test matrix.
- Complete App Store review preparation.

## Later
Features from the post-V1 backlog in `02_PRODUCT_SCOPE.md`. Their order will be decided using V1 retention and revenue data.

## Rules

- Do not build later-milestone features early.
- Each milestone must end in a working, testable build.
- Nothing ships publicly before M5.
