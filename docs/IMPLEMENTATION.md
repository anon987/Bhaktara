# First milestone decisions

All 27 original Markdown files in `bhaktara_docs/` were read. No applicable AGENTS.md was found. The supplied README.md and CLAUDE.md live in that folder, not at the root. The referenced `docs/design/DESIGN.md` was absent and has now been authored from the written design system. No design images, media files or credentials were supplied. Other specification references are present.

The decision log overrides stale scope and pending markers: no Panchang, XP only, guest league preview, signed-in leagues planned for V1. P-11 (final deity catalog) and P-12 (primary KPI) remain open. The fixture deities are a provisional subset of doc 18. The user's request to implement cross-roadmap UI previews immediately overrides the old handoff's instruction to wait and the older milestone ordering.

## Stack

The specs name React Native, strict TypeScript and React Navigation but leave bootstrap tooling unspecified. Expo SDK 57 with RN 0.86 and React Navigation 7 is used, with generated Android/iOS projects and a development client. Native sources are retained for future Firebase, AdMob, background audio and MediaStore integration. Expo Go is not the intended integration environment.

## Architecture

- Feature screens in `src/features/`; shared components in `src/components/`.
- Central typed routes and strict internal banner whitelist in `src/app/navigation/`.
- Zod content/local-state schemas and local-only timer/count helpers in `src/domain/` and `src/services/storage/`.
- Repository/service contracts with typed fixture data in `src/repositories/`.
- Android/iOS/default platform stubs expose explicit capability flags for wallpaper, ringtone, media saves, sharing and notifications.
- Analytics is a typed no-op. No Firebase SDK or production connections are installed.

## Mock boundaries

No real account is created. Google sign-in, audio/video playback, ads, downloads, WhatsApp intents, notification permissions, backend progression and rewards are unavailable and disclosed in the UI. Sample XP, ranks, badges, challenges and streaks never change as a consequence of local taps. League preview contains no fabricated participants.

AsyncStorage persists language, onboarding, deity, favorites, jaap count, meditation deadline and daily task completion. No XP exists in local writable state. Jaap marks completion only on each new 108th tap, not when reopening an old counter. Meditation uses a wall-clock deadline and handles background elapsed time and pause/resume. Device clock changes can affect this local timer; it is not trusted anti-cheat evidence. Local day grouping uses 04:00 without computing server streaks.

The player toggles preview controls and seek positions but makes no sound and does not advance time. Mandir uses symbolic art and visual offering feedback; bell sound is unavailable. Saves and special offerings disclose the future ad but never claim to grant an unlock. Free WhatsApp sharing reports unavailable media/native integration.

Fixture search is deliberately in-memory, not a production offline index. Production must use server-generated Firestore searchTokens. Offline mode in the developer controls is a UI simulation; all current fixtures are bundled and already work without network access. There is no production content cache or sync queue.

## Foundation reliability follow-up (2026-10-04)

Startup now waits for a successful local-state read before enabling the app or any persistence path, including background flushes. Failed reads or invalid saved data show a localized retry screen without overwriting the stored value. Retrying rereads storage; it does not reset progress. Three provider regression tests cover read failure/recovery, backgrounding during hydration, and repeated invalid-data failures. The browser smoke test also checks invalid persisted data and recovery through the actual retry screen.

TypeScript now includes only the app entry points, source, and tests. Previously Expo's inherited `allowJs` setting pulled generated export bundles into the compiler and caused a stack overflow. Strict checking remains enabled.

The initial review took place before Git was initialized, so earlier change history is unavailable. On 2026-10-04, Git was initialized on `main` and connected to the private [anon987/Bhaktara](https://github.com/anon987/Bhaktara) repository for the initial project checkpoint.

## Android device verification (2026-10-04)

Built the ARM64 debug APK with JDK 17, installed it on Samsung SM_E076B, and confirmed the Explore screen and five navigation tabs render through the Expo development client. Metro uses port 8081 with ADB reverse. The first build took 16m 45s; first JavaScript bundling took about 56 seconds. This confirms build/install/launch, not full native feature coverage. See [device instructions](ANDROID_DEVICE.md) and [verification results](verification/RESULTS.md).

## Next milestone

Implement development Firebase anonymous auth, typed catalog adapters and server practice session APIs with emulator security/idempotency tests. Replace art with reviewed R2 assets and integrate background audio. Google account link/merge precedes live leagues. No generic award-XP client endpoint should be introduced. CMS and production service setup remain outside this milestone.
