// AdMob rewarded ad unit ids (docs/ADS.md). Google's public test units are the
// default; a release build switches to real units through build-time env vars
// (.env.local / the ENV_LOCAL CI secret). Debug builds always use the test
// units so development taps never count as invalid traffic.
export const TEST_REWARDED_UNIT_IDS = {
  android: "ca-app-pub-3940256099942544/5224354917",
  ios: "ca-app-pub-3940256099942544/1712485313",
} as const;

export type AdPlatform = keyof typeof TEST_REWARDED_UNIT_IDS;

export function pickRewardedUnitId(
  platform: AdPlatform,
  configured: Partial<Record<AdPlatform, string | undefined>>,
  isDev: boolean,
): string {
  const id = configured[platform]?.trim();
  return !isDev && id ? id : TEST_REWARDED_UNIT_IDS[platform];
}

// Expo inlines EXPO_PUBLIC_* only for literal property accesses, so each
// variable is read by name rather than through a dynamic lookup.
export function rewardedUnitId(platform: AdPlatform, isDev: boolean): string {
  return pickRewardedUnitId(
    platform,
    {
      android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID,
      ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS,
    },
    isDev,
  );
}
