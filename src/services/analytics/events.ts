export type AnalyticsEvent =
  | "onboarding_complete"
  | "onboarding_language_selected"
  | "content_view"
  | "content_play"
  | "content_complete"
  | "mandir_aarti_play"
  | "content_favorite"
  // Doc 13 §2 save/set/share and §8 save_failed.
  | "content_save_tap"
  | "content_save_success"
  | "content_share"
  | "set_wallpaper"
  | "set_ringtone"
  | "save_failed"
  | "jaap_mala_complete"
  | "meditation_complete"
  // Doc 13 §4 Mandir.
  | "mandir_open"
  | "mandir_deity_selected"
  | "mandir_diya_lit"
  | "mandir_flower_offered"
  | "mandir_bell_rung"
  | "mandir_special_offering_tap"
  | "mandir_special_offering_used";
export interface AnalyticsService {
  track(
    event: AnalyticsEvent,
    parameters?: Record<string, string | number | boolean>,
  ): void;
}
