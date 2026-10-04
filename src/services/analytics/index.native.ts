import { getAnalytics, logEvent } from "@react-native-firebase/analytics";
import { AnalyticsService } from "./events";
export type { AnalyticsEvent, AnalyticsService } from "./events";

// Firebase Analytics, the doc 13 sink. Collection is disabled in firebase.json
// ("react-native" section) until the privacy policy and consent flow ship, so
// nothing leaves the device yet; the in-app privacy copy relies on this.
export const analytics: AnalyticsService = {
  track(event, parameters) {
    // Analytics must never break a user action, sync or async.
    Promise.resolve()
      .then(() => logEvent(getAnalytics(), event, parameters))
      .catch(() => undefined);
  },
};
