import { Content } from "./models";

// Doc 11 §4 (D-038, D-041): saving or setting a wallpaper, ringtone or status
// costs one rewarded ad; WhatsApp sharing is free. If rewarded ads are
// disabled, every gate opens. Doc 13: content_save_success.via.
export type SaveVia = "rewarded" | "free" | "fallback";
export type SaveGate = "free" | "rewarded";
export type RewardedUnlockType =
  "save_wallpaper" | "save_ringtone" | "save_status";

export function decideSaveGate(input: {
  // requiresRewardedAd(action) from the integrations layer.
  actionRequiresAd: boolean;
  // content.saveGate, set per item in the CMS (doc 06).
  itemGate: Content["saveGate"];
  // Remote Config emergency switches (doc 11 §5).
  rewardedAdsEnabled: boolean;
}): SaveGate {
  return input.actionRequiresAd &&
    input.itemGate === "REWARDED" &&
    input.rewardedAdsEnabled
    ? "rewarded"
    : "free";
}

// What a rewarded ad attempt ended with. "no-fill": no ad loaded within the
// timeout, which still unlocks (doc 11 §4 no-fill fallback).
export type RewardedOutcome = "rewarded" | "no-fill" | "dismissed";
export type SaveUnlock = { unlocked: true; via: SaveVia } | { unlocked: false };
export function unlockFromOutcome(outcome: RewardedOutcome): SaveUnlock {
  if (outcome === "rewarded") return { unlocked: true, via: "rewarded" };
  if (outcome === "no-fill") return { unlocked: true, via: "fallback" };
  return { unlocked: false };
}

export function rewardedUnlockType(
  type: Content["type"],
): RewardedUnlockType | null {
  if (type === "WALLPAPER") return "save_wallpaper";
  if (type === "RINGTONE") return "save_ringtone";
  if (type === "STATUS") return "save_status";
  return null;
}
