// In-app defaults for Remote Config (doc 11 §5 emergency switches, doc 22 §A2).
// Ads are not built until M4, so their switches default to off.
export const remoteDefaults = {
  ads_all_enabled: false,
  ads_native_enabled: false,
  ads_rewarded_enabled: false,
  // Comma-separated placement IDs to switch off individually.
  ads_disabled_placements: "",
  // Runtime override for the media CDN base; empty keeps the build's value.
  media_base_url: "",
};
export type RemoteBooleanKey = {
  [K in keyof typeof remoteDefaults]: (typeof remoteDefaults)[K] extends boolean
    ? K
    : never;
}[keyof typeof remoteDefaults];
export type RemoteStringKey = Exclude<
  keyof typeof remoteDefaults,
  RemoteBooleanKey
>;
export interface RemoteConfigService {
  start(): Promise<void>;
  getBoolean(key: RemoteBooleanKey): boolean;
  getString(key: RemoteStringKey): string;
}
