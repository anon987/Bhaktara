import type { RewardedAdPresenter } from "./rewardedGate";

// Web (and any platform without the native ad SDK): there is never inventory,
// so the doc 11 §4 no-fill rule applies and the unlock still goes ahead
// (reported as via "fallback"). Android/iOS use rewardedAd.native.ts.
export const rewardedAdPresenter: RewardedAdPresenter = {
  show: async () => "no-fill",
};
