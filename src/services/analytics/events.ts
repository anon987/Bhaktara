export type AnalyticsEvent =
  | "onboarding_complete"
  | "onboarding_language_selected"
  | "content_view"
  | "content_favorite"
  | "jaap_mala_complete"
  | "meditation_complete"
  | "mandir_deity_selected";
export interface AnalyticsService {
  track(
    event: AnalyticsEvent,
    parameters?: Record<string, string | number | boolean>,
  ): void;
}
