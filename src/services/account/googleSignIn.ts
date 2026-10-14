import type { GoogleSignInProvider } from "./accountClient";

// Web preview: no Google sign-in (the profile says it is unavailable).
export function createGoogleSignIn(): GoogleSignInProvider | undefined {
  return undefined;
}
