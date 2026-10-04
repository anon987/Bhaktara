import {
  fetchAndActivate,
  getRemoteConfig,
  getValue,
} from "@react-native-firebase/remote-config";
import { setRuntimeMediaBaseUrl } from "../media/config";
import { remoteDefaults, RemoteConfigService } from "./defaults";

let started: Promise<void> | null = null;
export const remoteConfig: RemoteConfigService = {
  // Fetch once per launch; defaults apply until (and if) the fetch succeeds.
  start: () =>
    (started ??= (async () => {
      const config = getRemoteConfig();
      // Web-SDK-style setters; React Native Firebase forwards them natively.
      config.settings = {
        minimumFetchIntervalMillis: __DEV__ ? 5 * 60_000 : 60 * 60_000,
        fetchTimeoutMillis: 10_000,
      };
      config.defaultConfig = remoteDefaults;
      await fetchAndActivate(config).catch(() => false);
      setRuntimeMediaBaseUrl(remoteConfig.getString("media_base_url"));
    })().catch((error: unknown) => {
      if (__DEV__) console.warn("Remote Config unavailable", error);
    })),
  getBoolean: (key) => getValue(getRemoteConfig(), key).asBoolean(),
  getString: (key) => getValue(getRemoteConfig(), key).asString(),
};
