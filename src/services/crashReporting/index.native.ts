import { getCrashlytics } from "@react-native-firebase/crashlytics";

// Creating the Crashlytics instance installs its JavaScript error and
// unhandled-rejection handlers; native crashes are captured regardless.
// Collection stays disabled in firebase.json until the privacy policy ships.
export function startCrashReporting() {
  getCrashlytics();
}
