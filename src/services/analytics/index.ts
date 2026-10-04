import { AnalyticsService } from "./events";
export type { AnalyticsEvent, AnalyticsService } from "./events";

// Web and tests send nothing. Android/iOS use index.native.ts.
export const analytics: AnalyticsService = { track: () => undefined };
