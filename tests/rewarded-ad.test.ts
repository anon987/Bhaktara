import {
  LATE_REWARD_MS,
  LOAD_TIMEOUT_MS,
  rewardedAdPresenter,
} from "../src/services/ads/rewardedAd.native";
import {
  pickRewardedUnitId,
  TEST_REWARDED_UNIT_IDS,
} from "../src/services/ads/adUnits";
import { unlockSave } from "../src/services/ads/rewardedGate";

// A controllable fake of react-native-google-mobile-ads: each test decides
// what the SDK does when an ad loads or shows, and emits ad events itself.
type MockEvent = { type: string };
type MockAd = {
  unitId: string;
  emit: (event: string) => void;
  load: jest.Mock;
  show: jest.Mock;
  destroy: jest.Mock;
};
const mockAds: MockAd[] = [];
const mockSdk = {
  onLoad: (_ad: MockAd) => undefined as void,
  onShow: async (_ad: MockAd) => undefined as void,
  canRequestAds: true,
  initialize: jest.fn(async () => []),
};
jest.mock("react-native-google-mobile-ads", () => ({
  __esModule: true,
  default: () => ({ initialize: mockSdk.initialize }),
  AdsConsent: {
    requestInfoUpdate: async () => ({ canRequestAds: mockSdk.canRequestAds }),
  },
  AdEventType: { ERROR: "error", CLOSED: "closed", OPENED: "opened" },
  RewardedAdEventType: {
    LOADED: "rewarded_loaded",
    EARNED_REWARD: "rewarded_earned_reward",
  },
  RewardedAd: {
    createForAdRequest: (unitId: string) => {
      let listener: ((event: MockEvent) => void) | undefined;
      const ad: MockAd & { addAdEventsListener: unknown } = {
        unitId,
        emit: (type) => listener?.({ type }),
        addAdEventsListener: (next: typeof listener) => {
          listener = next;
          return () => (listener = undefined);
        },
        load: jest.fn(() => mockSdk.onLoad(ad)),
        show: jest.fn(() => mockSdk.onShow(ad)),
        destroy: jest.fn(() => (listener = undefined)),
      };
      mockAds.push(ad);
      return ad;
    },
  },
}));

// Lets the presenter's promise chain (lazy require, consent, initialise) run.
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
const adsOn = {
  getBoolean: () => true,
};

beforeEach(() => {
  mockAds.length = 0;
  mockSdk.canRequestAds = true;
  mockSdk.onLoad = (ad) => ad.emit("rewarded_loaded");
  mockSdk.onShow = async () => undefined;
});
afterEach(() => {
  jest.useRealTimers();
});

test("the reward event is the only way to 'rewarded'", async () => {
  mockSdk.onShow = async (ad) => {
    ad.emit("opened");
    ad.emit("rewarded_earned_reward");
    ad.emit("closed");
  };
  await expect(rewardedAdPresenter.show("save_wallpaper")).resolves.toBe(
    "rewarded",
  );
  const [ad] = mockAds;
  expect(ad.unitId).toBe(TEST_REWARDED_UNIT_IDS.ios); // jest runs as iOS
  expect(ad.load).toHaveBeenCalledTimes(1);
  expect(ad.show).toHaveBeenCalledTimes(1);
  expect(ad.destroy).toHaveBeenCalled();
  // The SDK started once, lazily, and is reused for the next ad.
  await rewardedAdPresenter.show("save_status");
  expect(mockSdk.initialize).toHaveBeenCalledTimes(1);
});

test("closing the ad before the reward is 'dismissed' and does not unlock", async () => {
  jest.useFakeTimers();
  mockSdk.onShow = async (ad) => {
    ad.emit("opened");
    ad.emit("closed");
  };
  const outcome = rewardedAdPresenter.show("save_ringtone");
  await flush();
  // Still waiting in case the reward arrives just after the close.
  jest.advanceTimersByTime(LATE_REWARD_MS);
  await expect(outcome).resolves.toBe("dismissed");

  const unlock = unlockSave({ saveGate: "REWARDED" }, "save_ringtone", {
    presenter: rewardedAdPresenter,
    config: adsOn,
  });
  await flush();
  jest.advanceTimersByTime(LATE_REWARD_MS);
  await expect(unlock).resolves.toEqual({ unlocked: false });
});

test("a reward reported just after the close still counts", async () => {
  jest.useFakeTimers();
  let shown: MockAd | undefined;
  mockSdk.onShow = async (ad) => {
    shown = ad;
    ad.emit("closed");
  };
  const outcome = rewardedAdPresenter.show("save_wallpaper");
  await flush();
  shown?.emit("rewarded_earned_reward");
  await expect(outcome).resolves.toBe("rewarded");
});

test("no ad within 5 s is a no-fill, and a late load is never shown", async () => {
  jest.useFakeTimers();
  mockSdk.onLoad = () => undefined; // The network never answers.
  const outcome = rewardedAdPresenter.show("save_status");
  await flush();
  jest.advanceTimersByTime(LOAD_TIMEOUT_MS - 1);
  await flush();
  let settled = false;
  void outcome.then(() => (settled = true));
  await flush();
  expect(settled).toBe(false);
  jest.advanceTimersByTime(1);
  await expect(outcome).resolves.toBe("no-fill");
  const [ad] = mockAds;
  expect(ad.destroy).toHaveBeenCalled();
  ad.emit("rewarded_loaded");
  expect(ad.show).not.toHaveBeenCalled();
});

test("SDK errors fall back to an unlock instead of blocking the user", async () => {
  // Load error (e.g. no fill from AdMob).
  mockSdk.onLoad = (ad) => ad.emit("error");
  await expect(rewardedAdPresenter.show("save_status")).resolves.toBe(
    "no-fill",
  );
  await expect(
    unlockSave({ saveGate: "REWARDED" }, "save_status", {
      presenter: rewardedAdPresenter,
      config: adsOn,
    }),
  ).resolves.toEqual({ unlocked: true, via: "fallback" });

  // show() rejected by the SDK.
  mockSdk.onLoad = (ad) => ad.emit("rewarded_loaded");
  mockSdk.onShow = async () => {
    throw new Error("ad already shown");
  };
  await expect(rewardedAdPresenter.show("save_status")).resolves.toBe(
    "no-fill",
  );

  // An error while the ad is on screen, before any reward.
  mockSdk.onShow = async (ad) => {
    ad.emit("opened");
    ad.emit("error");
  };
  await expect(rewardedAdPresenter.show("save_status")).resolves.toBe(
    "no-fill",
  );
});

test("no ad is requested where consent is required but not given", async () => {
  mockSdk.canRequestAds = false;
  // Consent is checked once per launch, so a fresh module copy sees it.
  let fresh: typeof rewardedAdPresenter | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isolated = require("../src/services/ads/rewardedAd.native");
    fresh = isolated.rewardedAdPresenter;
  });
  const before = mockAds.length;
  await expect(fresh?.show("save_wallpaper")).resolves.toBe("no-fill");
  expect(mockAds.length).toBe(before);
});

test("web never loads an ad", async () => {
  // Jest resolves .native.ts first, so name the web file explicitly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const web = require("../src/services/ads/rewardedAd.ts");
  const before = mockAds.length;
  await expect(web.rewardedAdPresenter.show("save_wallpaper")).resolves.toBe(
    "no-fill",
  );
  expect(mockAds.length).toBe(before);
});

test("release builds use configured ad units; debug builds always test units", () => {
  const real = { android: "ca-app-pub-1/2", ios: "ca-app-pub-3/4" };
  expect(pickRewardedUnitId("android", real, false)).toBe("ca-app-pub-1/2");
  expect(pickRewardedUnitId("ios", real, false)).toBe("ca-app-pub-3/4");
  expect(pickRewardedUnitId("android", real, true)).toBe(
    TEST_REWARDED_UNIT_IDS.android,
  );
  expect(pickRewardedUnitId("android", { android: " " }, false)).toBe(
    TEST_REWARDED_UNIT_IDS.android,
  );
  expect(pickRewardedUnitId("ios", {}, false)).toBe(TEST_REWARDED_UNIT_IDS.ios);
});
