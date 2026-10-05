# Bhaktara progress and handoff

Last updated: **2026-10-06** (M2 habit layer deployed to dev).

## Current checkpoint

Bhaktara is an Android-first Expo app (SDK 57, RN 0.86) on the cloud `bhaktara-dev` Firebase project (React Native Firebase, D-048) with media on Cloudflare R2 (`bhaktara-media-dev`, r2.dev URL, D-047). M1 app features are verified on a Samsung SM_E076B. **The M2 habit layer is code-complete on `feature/m2-progression` (server) and `feature/m2-sadhana-sync` (app)**: server-authoritative practice sessions, reward ledger, XP, levels, streaks, daily/weekly challenges and badges in Cloud Functions, and redesigned devotional Sadhana screens wired to them. The Blaze plan is enabled on `bhaktara-dev`, and **all 24 Cloud Functions, the rules and the indexes are deployed there (2026-10-06)**, with the habit config, V1 badges and development challenges seeded. A live smoke test and the phone confirm XP, streak, badges and server-timed sessions. Not yet deployed: the Cloud Run media processor and the admin web Hosting; R2 upload secrets are not set.

Live milestone status is in [MILESTONES.md](MILESTONES.md), generated from `docs/progress/roadmap.json` (`npm run progress`; CI runs `progress:check`).

Branches: `main` (production), `develop` (integration), `feature/*` merged into `develop`. GitHub: [anon987/Bhaktara](https://github.com/anon987/Bhaktara).

## Start here (next session)

1. **Ask the operator how the new practice screens feel on the phone** (jaap mala, dhyan lamp, prayer thali, blessing sheet) and adjust. A meditation was credited on the phone on 2026-10-06 (30 XP, streak 1); jaap with a real minute-long mala, prayer, history and airplane mode still need a hands-on check.
2. **Write the launch challenge set** (8 weeks, doc 18) to replace the four development challenges in `scripts/progression/seed.ts`, then `npm run seed:progression:dev`.
3. **Admin CMS live check:** deploy the admin web to Hosting (`npm run admin:build`, `firebase deploy --project dev --only hosting`) and verify sign-in and roles against the deployed functions.
4. **Media pipeline (needs confirmation, billed/token):** create the R2 upload token (`m0-r2-token`), store `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` in Secret Manager, set `R2_UPLOAD_SECRETS=true` in `functions/.env.bhaktara-dev`, deploy the Cloud Run processor and set `MEDIA_PROCESSOR_URL`.
5. Still open from M1: `p-11` (deity list), real launch content, "Save wallpaper" on device.

Working rules for this repository:
- Run at most two background agents at once and never a Gradle build alongside two busy agents (the workstation crashed under more).
- Never print or commit `.env.r2`, `.env.local`, `google-services.json` or App Check debug tokens.
- Dev is the default target; staging/prod, DNS, token creation, cache purges and anything billed (including deploys) need explicit confirmation (doc 23).
- Native changes need a rebuild ([ANDROID_DEVICE.md](ANDROID_DEVICE.md), about 9 minutes incremental); JS changes reload through Metro.
- Bhaktara is used by elderly people: large type, Hindi first, plain words and guided flows for anything that leaves the app. Practice screens use devotional metaphors (D-052).

## M2 habit layer (2026-10-05)

Decisions: D-050 (earning needs a connection; offline practice is kept on the device and never credited later), D-051 (the jaap count starts again at 04:00), D-052 (devotional practice screens; doc 10 defaults adopted).

**Server** (`functions/src/progression.ts`, pure rules in `functions/src/progressionEngine.ts`, shared contracts in `src/domain/progression.ts`; details in doc 08 and doc 06 checkpoints):
- Callables `setTimezone` (also creates the server-owned profile), `startSession`, `completeSession`, `completePrayerChecklist`; scheduled `expireChallenges` (04:05 IST).
- One transaction per practice: server-timed credit (60 s per mala; meditation minutes ≤ elapsed), daily tasks from `appConfig/sadhana`, full-Sadhana bonus, Brahma Muhurta, streak, challenges, badges, the 300 XP cap. Ledger `rewardTransactions/{uid}_{type}_{sourceId}`; client-generated session IDs and stored results make retries and parallel calls pay once; only the latest session of a type can complete.
- Rules: own `userChallenges` by ID, active `challenges` and `badges`, `appConfig/gamification|sadhana`; progression stays server-written. New index `userChallenges(status, expiresAt)`.
- Seed: `npm run seed:progression:dev` (also part of the emulator seed).
- Tests: 12 engine unit tests plus 7 emulator suites (33 tests in `npm run test:functions`, all passing).

**App** (`src/features/sadhana/`):
- `ProgressionProvider` confirms the timezone, loads a snapshot (stats, today, 42 days, challenges, badges) and runs the practice flows; `BlessingSheet` shows XP, streak, level, sankalps and milestones with falling petals.
- Jaap: a 108-bead mala (sumeru and tassel, the deity's mantra and traditional mala: rudraksha, tulsi, chandan…), the whole screen is the tap target, haptic tick per bead, bell and petals per mala, "+15 अंक" rising from the mala. One server session per mala.
- Dhyan: duration tiles, a diya with a breathing halo and "साँस लें / साँस छोड़ें", a light ring that fills, three bell strikes at the end.
- Prarthana: a guided puja thali, one step at a time (पुष्प, दीप, धूप), an aarti lamp circling the plate on completion.
- Sadhana tab: akhand-jyoti streak lamp with level garland, today's three lamps, sankalp cards with marigold-garland progress, a lamp calendar and milestone medallions. Home and Profile show real XP, level and streak once the server answers.
- The bell (`assets/sounds/bell.m4a`) is synthesised by `scripts/media/generate-bell.py` and stays silent while a bhajan plays.
- Tests: 129 Jest tests pass (practice flows with a fake server: one session per mala, blessing, offline note, too-fast note, leftover beads).
- Visually checked in the web preview at phone size (Hindi). The blessing sheet with real XP is covered by Jest only until the functions are deployed.

Deployed to `bhaktara-dev` on 2026-10-06: `firebase deploy --project dev --non-interactive --force --only firestore,functions` (24 functions in asia-south1), then `npm run seed:progression:dev`. The phone runs the new native build (RNFB functions, expo-haptics) against it.

Gotchas found this session:
- **First 2nd-gen deploy:** the CLI enables Cloud Functions, Build, Artifact Registry, Run, Eventarc and Scheduler. The four Firestore triggers failed once with "Permission denied while using the Eventarc Service Agent" (propagation) and deployed on a retry a few minutes later. `--force` is needed to accept their retry policy (they are idempotent). The CLI set a 1-day cleanup policy on the asia-south1 image repository.
- **R2 secrets:** the CLI resolves `defineSecret` params for the whole codebase, even for excluded functions, so the R2 secrets are now declared only when `R2_UPLOAD_SECRETS=true`; until then `requestUploadUrl` answers that uploads are not configured.
- **Firestore index:** ordering `users/{uid}/days` by document ID descending failed on the real project (`failed-precondition`, the emulator does not enforce indexes). The history query now uses an ascending ID range and reverses in code. The provider logs the error code of a failed refresh.
- **Android text:** bold Devanagari in a self-sizing `Text` inside a centred pill lost its last word ("शुरू करें" → "शुरू"); giving the text the pill's full width fixed it. Watch for this in other pills.
- **Node smoke tests:** in an `.mts` script the JS SDK's callable did not attach the ID token (ESM/CJS split); calling the HTTPS endpoint with `Authorization: Bearer <idToken>` works.
- **Jest hung** while crawling `.claude/worktrees` (nine stale M1 agent worktrees, ~4.9 GB) and `android/` build output; `jest.config.js` now limits `roots` to `tests`, `src` and `modules`. The worktrees themselves are untouched.
- **Web preview mode:** `.env.local` selects cloud mode, and `EXPO_PUBLIC_BACKEND_MODE=emulator` on the command line did not override it in the web bundle (also not with `EXPO_NO_DOTENV=1`). To preview against the emulators, temporarily select emulator mode in `.env.local` or investigate further.

## Guided ringtone permission (2026-10-05)

Android grants "Modify system settings" (needed to set a ringtone) only on its own Settings screen, never in an in-app dialog (D-049). "Set as ringtone" therefore:

1. Shows a large-type Hindi/English sheet with three numbered steps and an animated switch (`SystemPermissionSheet`, `GuideSwitch`).
2. On "Continue", shrinks Bhaktara into a picture-in-picture window that shows "स्विच चालू करें / Turn ON the switch" over the Settings screen (`SettingsGuideOverlay`; the `plugins/withPictureInPicture` config plugin sets `supportsPictureInPicture`).
3. Watches the permission natively (`AppOpsManager.startWatchingMode` plus a 500 ms poll; JS timers pause in picture-in-picture), then brings Bhaktara back to full screen and sets the sound.
4. Falls back to opening the screen and continuing when the user returns, if picture-in-picture is unavailable or switched off.

Verified on Samsung SM_E076B on 2026-10-05: guide shown, permission granted, ringtone set to `Ringtones/Bhaktara/bhaktara-test-ringtone-bell-file…mp3`. Keep `supportsPictureInPicture` unset in the expo-video plugin options: `false` there deletes the manifest attribute.

## Earlier: storage hardening (2026-10-04)

- Fixed startup persistence so failed reads cannot overwrite saved progress with defaults, including when the app backgrounds before hydration.
- Added a Hindi/English retry screen that preserves stored data on read or validation failure.
- Restricted TypeScript inputs to app entry points, source and tests, resolving a compiler stack overflow caused by generated JavaScript bundles.
- Added storage recovery tests and a browser recovery scenario.
- Established the private GitHub repository. A scan of trackable text files found no common credential patterns. The bundled Android debug keystore is a development-only artifact, not a release signing key.

## Firebase foundation checkpoint

Implemented locally on `feature/firebase-foundation` after the initial `main` push:

- Optional `demo-bhaktara` Auth/Firestore emulator mode, with fixture mode still the default.
- Persistent anonymous sessions, shared initialization, explicit errors/retry, and mode-aware privacy copy.
- Validated published catalog reads, search-token normalization, composite indexes, bounded cursor pagination, direct details, and paginated favorite resolution.
- Local-only seed tooling, deny-by-default Firestore rules, six passing emulator/security scenarios, and a dedicated CI job.
- 31 passing app tests; emulator browser checks verify guest persistence, search, and a favorite beyond the initial catalog page. Firebase-enabled Android bundle export succeeds.
- The milestone is saved and pushed as `d0e082c` (`feat: add local Firebase auth and catalog foundation`).

No cloud project was configured, no infrastructure was deployed, and local practice/favorites were not migrated to the backend. The phone was not connected during this checkpoint; the previous device launch proves only the earlier foundation build. See [Firebase setup](FIREBASE_DEVELOPMENT.md) and [verification](verification/RESULTS.md).

## Review bug-fix pass

A full code review fixed these defects, each with a regression test:

- **Stale backend mode in builds:** Metro cached inlined `EXPO_PUBLIC_*` values, so a default export after an emulator export shipped emulator mode. `export:android`/`export:web` now use `--clear`, as do the documented mode-switch commands. Regenerate any `dist/` produced before this fix.
- **Explore pagination race:** during the search debounce, "Load more" could combine the previous query's cursor/offset with new filters. Results are now tied to the filters that produced them.
- **Explore empty pages:** text plus deity filters can empty a bounded server page while later pages match. The screen skips up to four empty pages and never shows "No results" while more pages exist.
- **Single-letter Firestore search** matched nothing because prefix tokens start at two letters; one-letter words no longer narrow the query.
- **Fixture search** now uses the shared `searchWords` normalization (punctuation, `sh`/`s` and other variants), matching emulator mode.
- **Meditation day attribution:** a timer that ended while the app was closed is credited to the day it ended; History is sorted by date instead of insertion order.
- **Profile favorites** no longer remount and reset pagination on every favorite toggle.

Open product decisions found in review: a permanently corrupt local record leaves the app on the retry screen (no reset path); jaap completion triggers on any 108 boundary of the cumulative count, so leftover beads from a previous day count toward today; deity chips on the Jaap screen are not yet used.

## Cloudflare R2 media foundation

The R2 media layer from doc 22 Part A is built: shared key/variant schemas, a CDN-base config with fallback to placeholder art, and `npm run media:publish` (ffmpeg renditions, EXIF stripping, content-addressed immutable uploads, dev-only bucket guard). The dev bucket `bhaktara-media-dev` is provisioned with CORS and a public r2.dev read address (D-047); no API token, custom domain or DNS record exists yet. The Cloudflare Claude Code plugin (skills plus MCP) is installed at user scope. Steps and decisions are in [MEDIA_R2.md](MEDIA_R2.md).

## Content import

`npm run content:import` reads a CSV/JSON manifest plus assets, validates each row and its doc 12 §5 checklist, publishes media to R2, and upserts `content` and `contentPrivate` in the Firestore emulator. It is idempotent by `importKey` and reports failures per row. Covered by unit tests and an emulator integration test; CI installs ffmpeg for it. `--project dev` writes to `bhaktara-dev` with Application Default Credentials; staging/prod need `--confirm-project`. See [CONTENT_IMPORT.md](CONTENT_IMPORT.md).

## Firebase dev project

`bhaktara-dev` exists under the operator's Google account; the Blaze plan was enabled on 2026-10-05 (nothing deployed beyond rules and indexes yet). `.firebaserc` alias `dev`; the default stays the local `demo-bhaktara`. Firestore `(default)` is Standard edition, Native mode, in `asia-south1` (Mumbai), with delete protection enabled. The repository's `firestore.rules` and all 8 composite indexes are deployed. A live unauthenticated read and write both return 403. Anonymous and Google sign-in are enabled. The Android app is registered with the debug SHA-1/SHA-256, and a Web app supplies the JavaScript SDK config. The app has a `cloud` backend mode, verified from Node: anonymous sign-in plus the catalog query against deployed rules and indexes. `seed:dev` has loaded the placeholder catalog (13 items, 5 deities, 2 banners), and `content:import --project dev` can add real items; both use the Admin SDK with Application Default Credentials. Still pending: on-device verification in cloud mode, App Check, and real launch content.

## Save, set and share (Android)

Wallpapers, ringtones and status videos can be saved to the gallery or ringtones (MediaStore), set as the home/lock wallpaper (WallpaperManager) or as the ringtone, notification or alarm sound (RingtoneManager), through the local Expo module `modules/bhaktara-media`. Status videos share through the system share sheet (`expo-sharing`) from a temporary cache copy. Downloads show progress and land in the app cache first. "Set as ringtone" first shows a large-type, step-by-step explainer with an animated switch (Android only grants "Modify system settings" on its own screen, never in an in-app dialog). It then shrinks Bhaktara into a picture-in-picture guide ("Turn ON the switch") over that screen, watches the permission natively and returns to full screen by itself to finish setting the sound. Without picture-in-picture it opens the screen and continues when the user comes back; Android 9 and older ask for storage permission. Saves pass a rewarded gate that is free while Remote Config keeps rewarded ads off; with no ad SDK before M4, an enabled gate falls back to no-fill and still saves. Placeholder items without CDN media show the actions as unavailable. Verified on Samsung SM_E076B on 2026-10-05 (wallpaper set, ringtone save and set, status video save); "Save wallpaper" is still to be confirmed. The ringtone permission flow is described above.

## Native Firebase (D-048)

On Android, Auth, Firestore, Analytics, Crashlytics, Remote Config and App Check now use React Native Firebase. The web preview and Node tests keep the JavaScript SDK through a shared repository adapter. Analytics and Crashlytics collection is disabled in `firebase.json` until the privacy policy ships. Remote Config carries the doc 11 ad switches (off) and a media base override.

Verified on 2026-10-05:
- On Samsung SM_E076B (ARM64 debug build):
  - Native anonymous auth restored the session.
  - The catalog, search filters and detail/player loaded from `bhaktara-dev`.
  - There were no JavaScript errors or crashes.
- The App Check API was enabled and the phone's debug token registered; a server-side exchange issued a token.
- The stale Expo placeholder launcher icons were replaced by the branded lotus icons generated from `app.json`. The `android-icon-*` and `splash-icon` assets are unused Expo placeholders.


## Remaining limitations and decisions

- Cloud Functions and Cloud Run are not deployed yet (Blaze is enabled; the first deploy waits for confirmation), so the admin CMS, banners, Home manager, audit log, server media processing and the habit layer run only in the emulators.
- No launch content: the catalog holds synthetic test items only.
- Server XP, streaks, challenges and badges are built but not deployed; leagues, Mandir, notifications and ads are not built (M3–M4).
- Media is served from the rate-limited r2.dev address; a Bhaktara domain is needed before release (D-047).
- Analytics and Crashlytics collection is disabled until the privacy policy and consent flow ship (M4).
- Open decisions: P-11 (deity list) and P-12 (north-star KPI). Google account link/merge must precede live leagues.

See [verification results](verification/RESULTS.md) for exact evidence and known warnings, and [implementation decisions](IMPLEMENTATION.md) for architecture and mock boundaries. Historical logs may show earlier failures superseded by the latest results.
