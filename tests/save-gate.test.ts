import {
  decideSaveGate,
  rewardedUnlockType,
  unlockFromOutcome,
} from "../src/domain/saveGate";
import {
  rewardedAdPresenter,
  saveGateFor,
  unlockSave,
} from "../src/services/ads/rewardedGate";
import { RemoteBooleanKey } from "../src/services/remoteConfig/defaults";

const config = (values: Partial<Record<RemoteBooleanKey, boolean>>) => ({
  getBoolean: (key: RemoteBooleanKey) => values[key] ?? false,
});
const adsOn = config({ ads_all_enabled: true, ads_rewarded_enabled: true });

test("a save is rewarded only when the action, the item and Remote Config all ask for it", () => {
  const rewarded = {
    actionRequiresAd: true,
    itemGate: "REWARDED" as const,
    rewardedAdsEnabled: true,
  };
  expect(decideSaveGate(rewarded)).toBe("rewarded");
  // Doc 11 §5: if rewarded ads are disabled, every gate opens.
  expect(decideSaveGate({ ...rewarded, rewardedAdsEnabled: false })).toBe(
    "free",
  );
  expect(decideSaveGate({ ...rewarded, itemGate: "FREE" })).toBe("free");
  // D-041: WhatsApp share never needs an ad.
  expect(decideSaveGate({ ...rewarded, actionRequiresAd: false })).toBe("free");
});

test("ad outcomes map to doc 13 via values; a dismissed ad does not unlock", () => {
  expect(unlockFromOutcome("rewarded")).toEqual({
    unlocked: true,
    via: "rewarded",
  });
  expect(unlockFromOutcome("no-fill")).toEqual({
    unlocked: true,
    via: "fallback",
  });
  expect(unlockFromOutcome("dismissed")).toEqual({ unlocked: false });
  expect(rewardedUnlockType("WALLPAPER")).toBe("save_wallpaper");
  expect(rewardedUnlockType("RINGTONE")).toBe("save_ringtone");
  expect(rewardedUnlockType("STATUS")).toBe("save_status");
  expect(rewardedUnlockType("BHAJAN")).toBeNull();
});

test("Remote Config defaults keep every save free until M4", async () => {
  const item = { saveGate: "REWARDED" as const };
  // In-app defaults: ads_rewarded_enabled is false.
  expect(saveGateFor(item)).toBe("free");
  const presenter = { show: jest.fn() };
  await expect(
    unlockSave(item, "save_wallpaper", { presenter }),
  ).resolves.toEqual({ unlocked: true, via: "free" });
  expect(presenter.show).not.toHaveBeenCalled();
  // The master switch also opens the gate.
  expect(saveGateFor(item, config({ ads_rewarded_enabled: true }))).toBe(
    "free",
  );
});

test("with rewarded ads on, the presenter decides and failures never block the save", async () => {
  const item = { saveGate: "REWARDED" as const };
  expect(saveGateFor(item, adsOn)).toBe("rewarded");
  expect(saveGateFor({ saveGate: "FREE" }, adsOn)).toBe("free");
  const presenter = { show: jest.fn(async () => "rewarded" as const) };
  await expect(
    unlockSave(item, "save_status", { presenter, config: adsOn }),
  ).resolves.toEqual({ unlocked: true, via: "rewarded" });
  expect(presenter.show).toHaveBeenCalledWith("save_status");
  presenter.show.mockResolvedValueOnce("dismissed" as never);
  await expect(
    unlockSave(item, "save_status", { presenter, config: adsOn }),
  ).resolves.toEqual({ unlocked: false });
  presenter.show.mockRejectedValueOnce(new Error("ad SDK crashed"));
  await expect(
    unlockSave(item, "save_status", { presenter, config: adsOn }),
  ).resolves.toEqual({ unlocked: true, via: "fallback" });
  // The default presenter is the AdMob one; the SDK fake in tests/setup.ts
  // never fills, so the save still goes ahead (doc 11 §4).
  await expect(rewardedAdPresenter.show("save_ringtone")).resolves.toBe(
    "no-fill",
  );
  await expect(
    unlockSave(item, "save_ringtone", { config: adsOn }),
  ).resolves.toEqual({ unlocked: true, via: "fallback" });
});
