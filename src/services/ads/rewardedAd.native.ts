import { Platform } from "react-native";
import type { RewardedOutcome } from "../../domain/saveGate";
import { rewardedUnitId } from "./adUnits";
import type { RewardedAdPresenter } from "./rewardedGate";

// AdMob rewarded ads through react-native-google-mobile-ads (docs/ADS.md).
// Doc 11 §4: never block the user. Anything short of a shown ad (no fill, a
// slow network, an SDK error, no consent) resolves "no-fill", which unlocks.
// Only the reward event yields "rewarded"; closing the ad early, "dismissed".

type AdsSdk = typeof import("react-native-google-mobile-ads");

// The ad must have loaded within this window, counted from the tap (it also
// covers the one-time SDK start-up on first use).
export const LOAD_TIMEOUT_MS = 5_000;
// Some networks report the reward just after the close event; wait briefly
// before calling a closed ad "dismissed".
export const LATE_REWARD_MS = 500;

type Ready = { sdk: AdsSdk; canRequestAds: boolean };
let ready: Promise<Ready> | null = null;

// Lazy, once per launch: the SDK module is only required on the first ad, so
// app start-up never touches it.
function prepare(): Promise<Ready> {
  ready ??= (async () => {
    // An inline require (not import()) so Metro and Jest both resolve it
    // synchronously at this point and not at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk: AdsSdk = require("react-native-google-mobile-ads");
    // UMP consent: outside the EEA/UK this is "not required" and ads go
    // ahead. Where consent is required but not given we show no consent form
    // and no ad (the unlock is free instead). If the UMP lookup itself fails,
    // the ad request goes ahead and Google applies its own regional rules.
    let canRequestAds = true;
    try {
      canRequestAds = (await sdk.AdsConsent.requestInfoUpdate()).canRequestAds;
    } catch {
      canRequestAds = true;
    }
    await sdk.default().initialize();
    return { sdk, canRequestAds };
  })().catch((error: unknown) => {
    ready = null; // Retry on the next ad.
    throw error;
  });
  return ready;
}

function show(): Promise<RewardedOutcome> {
  return new Promise((resolve) => {
    let ad: { destroy(): void } | undefined;
    let settled = false;
    let earned = false;
    let lateReward: ReturnType<typeof setTimeout> | undefined;
    // Assigned below, before anything can call finish().
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (outcome: RewardedOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimeout);
      clearTimeout(lateReward);
      try {
        ad?.destroy();
      } catch {
        // Best effort; the outcome is already decided.
      }
      resolve(outcome);
    };
    loadTimeout = setTimeout(() => finish("no-fill"), LOAD_TIMEOUT_MS);

    prepare()
      .then(({ sdk, canRequestAds }) => {
        if (settled) return;
        if (!canRequestAds) return finish("no-fill");
        const { AdEventType, RewardedAd, RewardedAdEventType } = sdk;
        const rewarded = RewardedAd.createForAdRequest(
          rewardedUnitId(Platform.OS === "ios" ? "ios" : "android", __DEV__),
        );
        ad = rewarded;
        rewarded.addAdEventsListener(({ type }) => {
          if (settled) return;
          if (type === RewardedAdEventType.LOADED) {
            // Loaded in time: the timeout no longer applies once it shows.
            clearTimeout(loadTimeout);
            rewarded.show().catch(() => finish("no-fill"));
          } else if (type === RewardedAdEventType.EARNED_REWARD) {
            earned = true;
            if (lateReward) finish("rewarded");
          } else if (type === AdEventType.CLOSED) {
            if (earned) finish("rewarded");
            else
              lateReward = setTimeout(
                () => finish(earned ? "rewarded" : "dismissed"),
                LATE_REWARD_MS,
              );
          } else if (type === AdEventType.ERROR) {
            finish(earned ? "rewarded" : "no-fill");
          }
        });
        rewarded.load();
      })
      .catch(() => finish("no-fill"));
  });
}

export const rewardedAdPresenter: RewardedAdPresenter = { show };
