# Bhaktara

Android-first React Native devotional app. This is the first **UI foundation milestone**, with typed fixture repositories and local practice tools. It is not a production service integration.

Private source repository: [anon987/Bhaktara](https://github.com/anon987/Bhaktara). Default branch: `main`. Dependencies, generated builds/APKs, local environment files, and credentials are excluded from version control.

Progress saved on **2026-10-04**: storage recovery and TypeScript fixes are complete; 24 tests and six browser flows pass. The ARM64 debug APK was built, installed, and launched on a Samsung SM_E076B. See [current progress and handoff](docs/PROGRESS.md), [device run instructions](docs/ANDROID_DEVICE.md), and [verification results](docs/verification/RESULTS.md). Full native interaction testing and service integration remain outstanding.

## Run

Use Node 24 LTS, npm, Android Studio/SDK, and JDK 17. Install an Android SDK/platform compatible with the generated Expo project. Set `ANDROID_HOME` to your SDK and `JAVA_HOME` to JDK 17.

```sh
npm ci
npm run android
```

`npm run android` builds/installs the development app and starts Metro. Start an emulator or attach an authorized Android device first. For an already installed development build:

```sh
npm start
```

Browser preview (same React Native components, useful for UI review; not proof of Android behavior):

```sh
npm run web
```

Checks and builds:

```sh
npm run typecheck
npm run lint
npm test
npm run export:android
npm run export:web
npm run build:android
```

`build:android` produces a debug APK under `android/app/build/outputs/apk/debug/`. It requires Metro when opened. For a single emulator architecture: `cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64`. No production credentials are needed. iOS native source is retained; building it requires macOS/Xcode and is outside this milestone.

After changing native dependencies or app config, run `npx expo prebuild --no-install`, review generated changes, then rebuild. Do not use `--clean` when retaining manual native edits.

## Implemented

- Strict TypeScript, feature folders, React Navigation, typed routes, validated banner whitelist, shared theme/components, Lucide icons and bundled Hindi/English fonts.
- Language-only onboarding; Home, Explore, Mandir, Sadhana, Profile in the required order.
- Banner-first Home, sample progress, shortcuts, daily practice and devotional cards.
- Search, category/deity filters, pagination, content details and local favorites.
- First-visit deity choice, visual diya/flowers/bell controls, aarti player entry and explicit rewarded-offering copy.
- Daily tasks, sample challenges, signed-in league preview, local history, persistent jaap counter, meditation presets with pause/resume/reset, prayer checklist.
- Sample Profile progress/badges, language settings, privacy/about screens, full player and persistent mini-player UI.
- Loading/error/retry/empty/offline preview states. In development, use Profile → Developer preview states. These are UI simulations.
- Safe startup storage recovery: failed reads preserve existing data and offer a localized retry before opening the app.

## Explicitly mocked or deferred

Authentication (including anonymous Firebase), actual audio/video playback, bell audio, notifications, ads, device saves/settings, WhatsApp share intents, server XP/streaks/rewards, live challenges and leagues are **not connected**. Controls disclose this. WhatsApp sharing remains free; saves and special offerings describe the future rewarded ad and never pretend it played. There are no real ads or interstitials.

Local storage contains only preferences, favorites and practice. Clearing app data removes these records. Sample XP/streaks/badges are labeled and never earned locally. All art is an original symbolic placeholder behind replaceable asset references. No lyrics, scriptures, Panchang, astrology, subscriptions or long videos are included. No CMS or production services were built.

## Specifications and architecture

Original documents are preserved under [bhaktara_docs](bhaktara_docs/README.md). The decision log overrides conflicting specifications. All 27 Markdown files were read. The referenced design export was missing; [DESIGN.md](docs/design/DESIGN.md) was created directly from the written requirements. No applicable AGENTS.md was found. Final deity taxonomy and the primary KPI remain open specification decisions.

See [implementation decisions](docs/IMPLEMENTATION.md) for layer boundaries and mock behavior, and [verification](docs/verification/RESULTS.md) for exact check results and environmental blockers.

Next milestone: development Firebase anonymous auth, catalog adapters, server-authoritative practice sessions with security/idempotency tests, reviewed R2 media, and real background audio. Then Google link/merge and live leagues. Credentials did not block this UI milestone.
