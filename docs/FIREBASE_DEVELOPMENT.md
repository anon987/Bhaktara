# Firebase foundation — local development

This checkpoint adds real anonymous Firebase authentication and Firestore catalog reads against local emulators. It does **not** provision or connect a cloud project. Fixture mode remains the default. Google linking, profile provisioning, server practice sessions/rewards, production media, and native Firebase telemetry remain later work.

## Start the backend

Use Node 24 and Java 21 for Firebase emulators. Android Gradle still uses JDK 17 as documented separately.

```sh
npm ci
npm run emulators
```

In another terminal:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:emulators
```

The seed upserts validated placeholder content/deities/banners and an inaccessible draft. It generates search tokens, never clears data, rejects non-loopback hosts, and targets only `demo-bhaktara`. These are synthetic test records, not reviewed launch content. Banner validity is relative to seeding; rerun after 30 days.

Auth: `127.0.0.1:9099`. Firestore: `127.0.0.1:8080`. Emulator console: `http://127.0.0.1:4000`. All bind to loopback. Data is temporary unless explicitly exported/imported. There is no cloud fallback.

## Connect the app

Browser:

```sh
EXPO_PUBLIC_BACKEND_MODE=emulator npm run web -- --clear
```

Physical phone with the debug app installed:

```sh
adb devices -l
export BHAKTARA_DEVICE='YOUR_DEVICE_SERIAL'
adb -s "$BHAKTARA_DEVICE" reverse tcp:8080 tcp:8080
adb -s "$BHAKTARA_DEVICE" reverse tcp:9099 tcp:9099
adb -s "$BHAKTARA_DEVICE" reverse tcp:8081 tcp:8081
EXPO_PUBLIC_BACKEND_MODE=emulator npm start -- --localhost --port 8081 --clear
```

Launch using [ANDROID_DEVICE.md](ANDROID_DEVICE.md). For an Android emulator set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2`; browser/ADB-reversed phones use `127.0.0.1` by default. Only these addresses and `localhost` are accepted. No API keys or service-account files are needed. See `.env.example`; optional `.env.local` is Git-ignored. Restart Metro with `--clear` when changing modes: Metro caches the inlined `EXPO_PUBLIC_*` values, so without it a build can silently keep the previous backend mode.

Auth waits for persisted identity before creating a guest and shares concurrent requests. Native uses AsyncStorage; web uses browser local persistence. Connection failures show retry and never silently substitute fixtures. The app labels emulator mode and its privacy behavior. Practice/favorites remain device-local: Firebase identity does not mean progress is backed up.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:emulators
```

Stop manually running emulators before `test:emulators`. It starts its own Auth/Firestore emulators, clears only the isolated `demo-bhaktara` test database, tests rules/adapters, and shuts down. Do not store valuable data in that test project. CI runs this suite with Java 21 and no credentials.

For browser integration verification, keep emulators running and seeded:

```sh
EXPO_PUBLIC_BACKEND_MODE=emulator npx expo export --platform web --clear --output-dir dist-emulator
python3 -m http.server 8766 --bind 127.0.0.1 --directory dist-emulator
```

Run `node scripts/smoke-firebase.mjs` in another terminal. It tests persistent anonymous identity, Firestore search, and a saved favorite outside the first catalog page. Results: `docs/verification/firebase-browser-smoke.json`. It does not print or save tokens or UIDs.

## Implementation boundaries

- `getBackend()` chooses fixture/emulator adapters; screens never import Firebase.
- Validated queries are bounded: content max 30 (home 12), deities 30, banners 10. Favorite pages fetch ten IDs.
- Cursors sort by popularity and document ID and are bound to search/filter values. Malformed responses fail the request.
- Search sends the longest normalized token to Firestore. Remaining words and, during text search, deity matching filter the returned page. An empty filtered page may still have a cursor. Firestore permits only one `array-contains` clause per query.
- Home is a bounded catalog adapter; server-precomputed feeds remain pending. Emulator progress values remain sample-only, with zero XP/streak and no challenges.
- Rules block unauthenticated catalog access, unpublished/inactive records, unbounded catalog queries, cross-user access, direct progression writes, and guest leagues. Profile updates restrict fields/types.
- Server profile creation, device registration, CMS client writes and unimplemented collections are denied. Favorites rules exist and are tested, but app favorites still do not sync. Trusted test seeding uses emulator-only rule bypass.
- Composite indexes are committed. Emulators do not prove cloud index readiness; verify before real development deployment.

The JS SDK provides a shared Auth/Firestore adapter without changing the existing native build. Native Analytics/Crashlytics/App Check still need later integration. Firebase 12.19's RN persistence export is absent from its root TypeScript declarations; `src/types/firebase-auth.d.ts` narrowly declares the installed RN signature. Only the native persistence module calls it.

References: [Expo Firebase setup](https://docs.expo.dev/guides/using-firebase/), [emulator auth](https://firebase.google.com/docs/emulator-suite/connect_auth), [Firestore queries](https://firebase.google.com/docs/firestore/query-data/queries), [rules tests](https://firebase.google.com/docs/rules/unit-tests).

## Next work

Confirm a real development Firebase project; add server profile provisioning, a development App Check strategy, account-aware preference/favorite sync, and server practice APIs with validation/idempotency tests. Reviewed R2 assets and real background audio follow. Google linking/merge precedes live leagues. No cloud deployment is included here.
