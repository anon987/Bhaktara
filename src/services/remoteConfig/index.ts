import { remoteDefaults, RemoteConfigService } from "./defaults";

// Web and tests: in-app defaults only. Android/iOS use index.native.ts.
export const remoteConfig: RemoteConfigService = {
  start: async () => undefined,
  getBoolean: (key) => remoteDefaults[key],
  getString: (key) => remoteDefaults[key],
};
