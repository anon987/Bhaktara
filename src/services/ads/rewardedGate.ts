import { Content } from "../../domain/models";
import {
  decideSaveGate,
  RewardedOutcome,
  RewardedUnlockType,
  SaveGate,
  SaveUnlock,
  unlockFromOutcome,
} from "../../domain/saveGate";
import { requiresRewardedAd } from "../integrations";
import { remoteConfig } from "../remoteConfig";
import { RemoteConfigService } from "../remoteConfig/defaults";

// M4 seam: the AdMob rewarded unit implements this (load with a 5 s timeout,
// show, report the outcome) and replaces `rewardedAdPresenter` below. No ad
// SDK is linked before then.
export interface RewardedAdPresenter {
  show(unlockType: RewardedUnlockType): Promise<RewardedOutcome>;
}
// Without an ad SDK there is never inventory, so the doc 11 §4 no-fill rule
// applies and the save still goes ahead (reported as via "fallback"). Only
// reachable when Remote Config turns rewarded ads on before M4 ships.
export const rewardedAdPresenter: RewardedAdPresenter = {
  show: async () => "no-fill",
};

type GateConfig = Pick<RemoteConfigService, "getBoolean">;
export function saveGateFor(
  item: Pick<Content, "saveGate">,
  config: GateConfig = remoteConfig,
): SaveGate {
  return decideSaveGate({
    actionRequiresAd: requiresRewardedAd("save"),
    itemGate: item.saveGate,
    // ads_all_enabled is the master switch over every ad format.
    rewardedAdsEnabled:
      config.getBoolean("ads_all_enabled") &&
      config.getBoolean("ads_rewarded_enabled"),
  });
}

export async function unlockSave(
  item: Pick<Content, "saveGate">,
  unlockType: RewardedUnlockType,
  {
    presenter = rewardedAdPresenter,
    config = remoteConfig,
  }: { presenter?: RewardedAdPresenter; config?: GateConfig } = {},
): Promise<SaveUnlock> {
  if (saveGateFor(item, config) === "free")
    return { unlocked: true, via: "free" };
  try {
    return unlockFromOutcome(await presenter.show(unlockType));
  } catch {
    // Never block the user because of ad failures (doc 11 §4).
    return { unlocked: true, via: "fallback" };
  }
}
