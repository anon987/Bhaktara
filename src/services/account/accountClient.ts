import type { AccountRepository } from "../../repositories/accountRepository";

// The account side of the app (doc 21): the callables come from
// src/repositories/accountRepository.ts; this file describes the Firebase
// Auth and Google sign-in pieces the flows need.

// The signed-in user as the account screens need it.
export type AccountUser = {
  uid: string;
  isAnonymous: boolean;
  // From the Google profile (never stored by the app as the display name
  // unless the devotee has none).
  providerName: string | null;
  email: string | null;
};

// The devotee's stored profile (users/{uid}: written by updateProfile).
export type StoredProfile = {
  displayName: string | null;
  photoKey: string | null;
};

// Firebase Auth as the account flows use it; one implementation per SDK
// (client.native.ts, client.ts) and a fake in tests.
export interface AccountAuth {
  current(): AccountUser | null;
  getIdToken(): Promise<string>;
  // Links a Google ID token to the current (guest) user: same UID.
  linkGoogle(idToken: string): Promise<void>;
  // Switches to the Google account that already exists.
  signInGoogle(idToken: string): Promise<void>;
  signOut(): Promise<void>;
  signInAnonymously(): Promise<void>;
  readProfile(uid: string): Promise<StoredProfile>;
}

// The native Google sign-in sheet. Null means the devotee cancelled.
export type GoogleAccount = {
  idToken: string;
  name: string | null;
  email: string | null;
};
export interface GoogleSignInProvider {
  signIn(): Promise<GoogleAccount | null>;
  signOut(): Promise<void>;
}

export type AccountBackend = {
  callables: AccountRepository;
  auth: AccountAuth;
  // Absent where Google sign-in is not supported (web preview).
  google?: GoogleSignInProvider;
};
