# Rewarded ads (AdMob)

Rewarded ads unlock saves (wallpaper, ringtone, status) and Mandir decor. The
SDK is [react-native-google-mobile-ads](https://docs.page/invertase/react-native-google-mobile-ads).
Rules come from `bhaktara_docs/11_ADS_AND_MONETIZATION.md`.

## How it fits together

| File | Role |
|---|---|
| `src/services/ads/rewardedGate.ts` | `RewardedAdPresenter` seam, `saveGateFor`, `unlockSave` |
| `src/services/ads/rewardedAd.native.ts` | AdMob presenter (Android/iOS) |
| `src/services/ads/rewardedAd.ts` | Web: always `"no-fill"`, never loads the SDK |
| `src/services/ads/adUnits.ts` | Ad unit ids (test by default, env override) |

`rewardedAdPresenter.show(unlockType)` resolves to a `RewardedOutcome`
(`src/domain/saveGate.ts`) and never rejects:

| What happened | Outcome | `unlockFromOutcome` |
|---|---|---|
| Reward event fired (also within 0.5 s after the close) | `"rewarded"` | unlocked, via `rewarded` |
| Ad closed before the reward | `"dismissed"` | not unlocked |
| No ad loaded within 5 s of the tap | `"no-fill"` | unlocked, via `fallback` |
| Any SDK error (load, show, start-up), or no consent | `"no-fill"` | unlocked, via `fallback` |

Doc 11 §4 rules this keeps:
- **Never block the user.** Every failure unlocks; only a deliberate early
  close keeps the item locked.
- **No-fill fallback:** if no ad loads within 5 s, the unlock goes ahead.
- Rewarded ads are only shown after a user tap; they never grant XP or streaks.
- Remote Config `ads_all_enabled` and `ads_rewarded_enabled` (both default
  `false`) are the emergency switches. While either is off, every gate is
  free and the SDK is never touched.

The SDK starts lazily on the first ad (one `initialize()` per launch), never on
the app start-up path. The 5 s window includes that start-up, so the very
first ad on a slow phone may fall back to a free unlock.

## Consent (EEA/UK)

On first use the presenter asks Google's UMP SDK for the consent status.
Outside the EEA/UK it is "not required" and ads load normally. Where consent
is required but not yet given, we do **not** show a consent form; that user
gets free unlocks instead. If the UMP lookup itself fails, the ad request goes
ahead and Google applies its regional rules.

To show the consent form later: create a GDPR message in AdMob (Privacy &
messaging), then call `AdsConsent.gatherConsent()` from a settings screen.

## App ids and ad units

Google's public **test** ids are the default:

| | Android | iOS |
|---|---|---|
| App id | `ca-app-pub-3940256099942544~3347511713` | `ca-app-pub-3940256099942544~1458002511` |
| Rewarded unit | `ca-app-pub-3940256099942544/5224354917` | `ca-app-pub-3940256099942544/1712485313` |

### Switching to real ids

1. **App ids (native, needs a new APK).** They live in `app.json` twice:
   - the top-level `react-native-google-mobile-ads` key
     (`android_app_id`, `ios_app_id`). The library's Gradle script and iOS
     build phase read this at build time. This is what our committed
     `android/` project uses.
   - the `react-native-google-mobile-ads` config plugin options
     (`androidAppId`, `iosAppId`), used by `expo prebuild`.

   The repo has no `app.config.*`, so env vars cannot override them directly.
   To keep real ids out of git, have CI rewrite `app.json` before Gradle:

   ```sh
   jq --arg id "$ADMOB_ANDROID_APP_ID" \
     '."react-native-google-mobile-ads".android_app_id = $id
      | (.expo.plugins[] | select(type == "array" and .[0] == "react-native-google-mobile-ads") | .[1].androidAppId) = $id' \
     app.json > app.json.tmp && mv app.json.tmp app.json
   ```

   Without an app id the native SDK crashes at start-up, so never remove it.
2. **Rewarded unit ids (JS, inlined at bundle time).** Set in `.env.local`
   (the `ENV_LOCAL` CI secret):

   ```
   EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID=ca-app-pub-XXXX/YYYY
   EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS=ca-app-pub-XXXX/ZZZZ
   ```

   Only release bundles use them; debug (`__DEV__`) always uses the test unit
   so development taps are never invalid traffic.
3. Turn ads on with Remote Config: `ads_all_enabled` and
   `ads_rewarded_enabled` = `true`.

### Test devices

With real ids, register phones as test devices before tapping ads: AdMob >
Settings > Test devices (by advertising id), or watch `adb logcat` for
`Use RequestConfiguration.Builder().setTestDeviceIds(...)` and add that id.
Never click live ads on your own phone.

## Builds

Adding the SDK is a native change: a new dev-client/release APK is required
(`scripts/deploy-to-phone.sh <branch>`). iOS also needs `pod install`.

## Tests

`tests/setup.ts` fakes `react-native-google-mobile-ads` (every load fails as no
fill), so Jest never loads the native module. `tests/rewarded-ad.test.ts`
drives a controllable fake: earned, dismissed, late reward, 5 s timeout,
errors, consent and unit id selection.
