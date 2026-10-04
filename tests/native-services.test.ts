import { logEvent } from "@react-native-firebase/analytics";
import {
  fetchAndActivate,
  getRemoteConfig,
} from "@react-native-firebase/remote-config";
// Jest resolves the .native implementations, as Android does.
import { analytics } from "../src/services/analytics";
import { remoteConfig } from "../src/services/remoteConfig";
import { resolveMediaUrl } from "../src/services/media/config";

test("analytics forwards events to Firebase and never throws", async () => {
  analytics.track("content_favorite", { content_id: "bhajan-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(logEvent).toHaveBeenCalledWith({}, "content_favorite", {
    content_id: "bhajan-1",
  });
  (logEvent as jest.Mock).mockImplementationOnce(() => {
    throw new Error("native failure");
  });
  expect(() => analytics.track("content_view")).not.toThrow();
});

test("remote config applies safe defaults and ignores an empty media override", async () => {
  const config = getRemoteConfig() as unknown as {
    defaultConfig: Record<string, string | boolean>;
  };
  await remoteConfig.start();
  expect(fetchAndActivate).toHaveBeenCalledTimes(1);
  // Ads stay off until M4; a failed fetch keeps the defaults.
  expect(remoteConfig.getBoolean("ads_all_enabled")).toBe(false);
  expect(remoteConfig.getBoolean("ads_rewarded_enabled")).toBe(false);
  expect(config.defaultConfig.media_base_url).toBe("");
  // start() runs once per launch.
  await remoteConfig.start();
  expect(fetchAndActivate).toHaveBeenCalledTimes(1);
  expect(resolveMediaUrl("wallpaper/a/thumb.0a1b2c3d.webp")).toBeNull();
});
