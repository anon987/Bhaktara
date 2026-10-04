# Project verification — 2026-10-04

## Latest: Firebase foundation checkpoint

Implemented on `feature/firebase-foundation` with no cloud provisioning/deployment. The default remains fixtures; opt-in local emulators provide actual anonymous Firebase sessions and Firestore catalog/search.

| Check | Result |
| --- | --- |
| App regression suite | Passed: 31 tests, 5 suites |
| Auth/Firestore emulator suite | Passed: 6 scenarios with real SDK queries and security rules |
| Emulator-mode browser smoke | Passed: 4 flows, no page errors; persistent identity, search, and favorite lookup beyond home page |
| Emulator-mode Android export | Passed; no new APK/device test in this checkpoint |

Evidence: [emulator results](firebase-emulators.json), [browser results](firebase-browser-smoke.json), and `screenshots/11-firebase-content.png`. The Android phone was not connected during this checkpoint. Earlier native-launch evidence below covers the previous app version only.

The emulator tests cover unauthenticated/draft/unbounded read rejection, owner preference restrictions, direct progression write rejection, cross-user privacy, favorite ownership/publication validation, guest league exclusion, real anonymous sign-in, search and cursor traversal. They do not prove cloud composite-index readiness or native auth persistence. Browser auth persistence is verified across reload.

New setup and limitations are documented in [FIREBASE_DEVELOPMENT.md](../FIREBASE_DEVELOPMENT.md). Cloud auth, server profiles, account-aware sync, practice/reward APIs, reviewed media, background playback, native telemetry and App Check remain pending. The original milestone evidence follows for history.

## Connected Android phone follow-up

The ARM64 debug APK built successfully using JDK 17 and `ANDROID_HOME=/home/techappdev/Android/Sdk` with `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain`. Build time: 16m 45s. ADB installation succeeded on the connected Samsung SM_E076B. Launched `com.bhaktara.app` through the development-client URL with port 8081 reversed to Metro. Metro bundled Android successfully in about 56 seconds, the app logged `Running "main"`, and a phone screenshot confirmed the Explore screen and all five navigation tabs rendering. This verifies native build/install/launch; a full native interaction test pass remains outstanding. Metro was left running at the end of that session; future sessions should check or restart it using the [device instructions](../ANDROID_DEVICE.md). The screenshot was inspected from a temporary file and is not retained in the workspace.

APK: `android/app/build/outputs/apk/debug/app-debug.apk` (approximately 72 MB), application ID `com.bhaktara.app`, version `0.1.0` / code `1`. SHA-256: `de87362b5947a2d0a8ef87f65ac1f6a17826100796b0490dd750af5da74fdef1`. Rebuilding can change this checksum.

## Current status

Bhaktara has a working React Native UI foundation with five tabs, Hindi/English onboarding, fixture content discovery, favorites, Mandir previews, and persistent local practice tools. This is not a completed M0 or production V1: Cloud Firebase environments, telemetry integrations, production catalog/media, real playback, server progression, CMS, leagues, notifications, and ads remain unconnected; local emulator auth/catalog is implemented as described above.

Git was initialized after this verification and connected to the private [anon987/Bhaktara](https://github.com/anon987/Bhaktara) repository. History before the initial checkpoint is unavailable. The debug APK exists locally and native launch is verified; build artifacts are ignored by Git. The old `android-build.log` ends with an AAPT2 daemon exit from the earlier attempt; it is historical evidence and does not describe the successful device build.

## Changes completed

- Fixed a data-loss path where failed startup reads could enable writes of empty defaults. Background flushes now also wait for successful hydration.
- Added a localized startup error and retry action that preserves stored data and restores it after a successful read.
- Fixed the TypeScript stack overflow by limiting compiler inputs to source, entry points, and tests instead of generated bundles.
- Added three storage recovery regression tests and a real browser recovery check. Updated ambiguous Mandir smoke selectors to account for feedback displayed in two places.

## Checks run after changes

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed; strict checking enabled |
| `npm run lint` | Passed with two existing `no-require-imports` warnings in `tests/setup.ts` |
| `npm test -- --silent` | Passed: 24 tests across 3 suites |
| `npm run export:android` | Passed; JavaScript/Hermes export, not a native APK build |
| `npm run export:web` | Passed |
| `node scripts/smoke.mjs` | Passed: six flows, no browser page errors |
| ARM64 Gradle debug build | Passed: 543 actionable tasks; 16m 45s |
| ADB install and device launch | Passed on Samsung SM_E076B; Explore and five tabs visibly rendered |

The first baseline test run timed out during onboarding. Subsequent complete runs passed without increasing the timeout. Initial smoke failures exposed ambiguous selectors and incorrect corruption setup; the final test seeds corrupt data before app initialization, after the outgoing page flushes its legitimate state.

Browser results are in [browser-smoke.json](browser-smoke.json); screenshots are under `screenshots/`, including `10-storage-recovery.png`. Other existing log files predate this follow-up and may contain the earlier failures. The final web export occupies `dist/`; the export commands share that default output directory.

## Next priorities

1. Complete native interaction testing on the connected phone: onboarding, navigation, search, favorites, practice timers, persistence, and storage recovery. Build/install/launch is already verified.
2. Confirm a cloud development Firebase project, provision server-owned profiles, and add account-aware synchronization; emulator auth/catalog and initial security tests are now implemented.
3. Add reviewed media and real background audio; implement server-authoritative practice sessions and idempotent rewards before showing earned progression.

No external services were provisioned or deployed during this follow-up. The canonical deity list and primary KPI remain open product decisions.
