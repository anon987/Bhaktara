# Bhaktara progress and handoff

Last updated: **2026-10-04**.

## Current checkpoint

The UI foundation runs in the browser and on an Android phone. It uses fixture content and local-only practice state by default, with an opt-in Firebase emulator backend for development. Production M0 and V1 are not complete. Git is connected to the private repository [anon987/Bhaktara](https://github.com/anon987/Bhaktara); the current Firebase checkpoint is committed as `d0e082c` on `feature/firebase-foundation`, pushed to `origin`, with a clean working tree.

## Completed in this work session

- Reviewed the implementation, roadmap, existing checks, and native build evidence.
- Fixed startup persistence so failed reads cannot overwrite saved progress with defaults, including when the app backgrounds before hydration.
- Added a Hindi/English retry screen that preserves stored data on read or validation failure.
- Restricted TypeScript inputs to app entry points, source, and tests, resolving a compiler stack overflow caused by generated JavaScript bundles.
- Added three storage recovery tests and a browser recovery scenario; fixed ambiguous Mandir feedback selectors in the smoke script.
- Passed typechecking, lint (two existing test-setup warnings), all 24 tests, Android/web exports, and six browser smoke flows.
- Built the ARM64 debug APK, installed it on Samsung SM_E076B, and verified app startup and visible navigation. Left Metro running at the end of the device session.
- Reconciled status documentation and saved reproducible device build/install/launch instructions.
- Established the private GitHub repository and initial source-control checkpoint. A scan of trackable text files found no common credential patterns; no files exceeded 10 MiB. The bundled Android debug keystore is a development-only artifact, not a release signing key.

## Implementation files changed

| Area | Files |
| --- | --- |
| Safe storage hydration and retry | `src/app/providers/AppProvider.tsx`, `App.tsx`, `src/i18n/strings.ts` |
| Compiler scope | `tsconfig.json` |
| Regression checks | `tests/storage-recovery.test.tsx`, `scripts/smoke.mjs` |
| Documentation | `README.md`, `docs/IMPLEMENTATION.md`, `docs/verification/RESULTS.md`, `docs/ANDROID_DEVICE.md`, this file, `bhaktara_docs/16_RELEASE_ROADMAP.md` |

## Firebase foundation checkpoint

Implemented locally on `feature/firebase-foundation` after the initial `main` push:

- Optional `demo-bhaktara` Auth/Firestore emulator mode, with fixture mode still the default.
- Persistent anonymous sessions, shared initialization, explicit errors/retry, and mode-aware privacy copy.
- Validated published catalog reads, search-token normalization, composite indexes, bounded cursor pagination, direct details, and paginated favorite resolution.
- Local-only seed tooling, deny-by-default Firestore rules, six passing emulator/security scenarios, and a dedicated CI job.
- 31 passing app tests; emulator browser checks verify guest persistence, search, and a favorite beyond the initial catalog page. Firebase-enabled Android bundle export succeeds.
- The milestone is saved and pushed as `d0e082c` (`feat: add local Firebase auth and catalog foundation`).

No cloud project was configured, no infrastructure was deployed, and local practice/favorites were not migrated to the backend. The phone was not connected during this checkpoint; the previous device launch proves only the earlier foundation build. See [Firebase setup](FIREBASE_DEVELOPMENT.md) and [verification](verification/RESULTS.md).

## Resume here

1. Reconnect the Android phone and run the new emulator mode using [Firebase development setup](FIREBASE_DEVELOPMENT.md). Verify native anonymous-session persistence, catalog errors/retry, search/pagination, favorites, and unchanged local practice tools.
2. Confirm the real development Firebase project and configuration. Add server profile provisioning and a development App Check strategy before cloud integration.
3. Implement account-aware preference/favorite sync and server-authoritative practice sessions with security/idempotency tests, followed by reviewed R2 media and real background audio. Google link/merge precedes live leagues.

## Remaining limitations and decisions

Cloud authentication and Google linking, real playback, bell audio, native saves/sharing, notifications, ads, server XP/streaks/rewards, live challenges/leagues, CMS, and production services are not connected. Sample progression is explicitly non-authoritative. No external services were provisioned or deployed.

The final deity taxonomy (P-11) and primary KPI (P-12) remain undecided. Google account link/merge must precede live leagues. Keep client-local practice separate from server-authoritative rewards.

See [verification results](verification/RESULTS.md) for exact evidence and known warnings, and [implementation decisions](IMPLEMENTATION.md) for architecture and mock boundaries. Historical logs may show earlier failures superseded by the latest results.
