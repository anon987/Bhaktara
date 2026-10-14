import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { BhaktaraMedia } from "../../../modules/bhaktara-media";
import { codedError } from "../../repositories/firestoreErrors";
import type { GoogleSignInProvider } from "./accountClient";

// Google Sign-In on Android (Play Services). The ID token is requested for
// the Firebase project's OAuth web client: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
// if the build sets it, otherwise default_web_client_id, which the Google
// Services plugin writes from google-services.json (client_type 3).
const webClientId = () =>
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  BhaktaraMedia?.googleWebClientId?.() ||
  null;

// Google Play Services' CommonStatusCodes.NETWORK_ERROR.
const NETWORK_ERROR = "7";

export function createGoogleSignIn(): GoogleSignInProvider {
  let configured = false;
  return {
    async signIn() {
      if (!configured) {
        const clientId = webClientId();
        if (!clientId)
          throw codedError("google/not-configured", "No OAuth web client");
        GoogleSignin.configure({ webClientId: clientId });
        configured = true;
      }
      try {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      } catch {
        throw codedError("google/play-services", "Play Services missing");
      }
      try {
        const response = await GoogleSignin.signIn();
        if (response.type !== "success") return null;
        const { idToken, user } = response.data;
        if (!idToken) throw codedError("google/no-token", "No ID token");
        return { idToken, name: user.name, email: user.email };
      } catch (error) {
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
          if (error.code === statusCodes.IN_PROGRESS)
            throw codedError("google/in-progress", "Sign-in in progress");
          if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
            throw codedError("google/play-services", "Play Services missing");
          if (error.code === NETWORK_ERROR)
            throw codedError("google/network", "Network error");
        }
        throw error;
      } finally {
        // Firebase keeps the session; forgetting Google's own choice means
        // the account picker shows every time (a shared family phone).
        await GoogleSignin.signOut().catch(() => undefined);
      }
    },
    async signOut() {
      await GoogleSignin.signOut().catch(() => undefined);
    },
  };
}
