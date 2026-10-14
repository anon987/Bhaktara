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
import { rewardedAdPresenter } from "./rewardedAd";

// Shows one rewarded ad and reports how it ended. The AdMob implementation
// (rewardedAd.native.ts) loads with a 5 s timeout; web has a permanent
// no-fill (rewardedAd.ts). Callers may also inject their own (tests).
export interface RewardedAdPresenter {
  show(unlockType: RewardedUnlockType): Promise<RewardedOutcome>;
}
export { rewardedAdPresenter };

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
