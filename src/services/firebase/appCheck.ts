import type { FirebaseApp } from "@react-native-firebase/app";
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from "@react-native-firebase/app-check";

let started = false;
// App Check in monitor mode (M0): every Auth/Firestore request carries a token,
// but the console does not enforce them until M4. Debug builds use the debug
// provider; register the token it logs in Firebase Console → App Check.
// Release builds use Play Integrity.
export function startAppCheck(app: FirebaseApp) {
  if (started) return;
  started = true;
  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: { provider: __DEV__ ? "debug" : "playIntegrity" },
    apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
  });
  // Monitor mode must never block the app.
  Promise.resolve()
    .then(() =>
      initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true }),
    )
    .catch((error: unknown) => {
      if (__DEV__) console.warn("App Check did not start", error);
    });
}
