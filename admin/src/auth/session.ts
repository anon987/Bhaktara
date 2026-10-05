import {
  Auth,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminRole, isAdminRole } from "../domain";

export type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};
export type Session =
  | { kind: "loading" }
  | { kind: "signed-out"; error?: string }
  | {
      kind: "signed-in";
      user: SessionUser;
      // From the `role` custom claim (doc 09 §15); null when absent/unknown.
      role: AdminRole | null;
      anonymous: boolean;
    };
export type SessionActions = {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  // Forces a fresh ID token so a newly granted role takes effect.
  refresh(): Promise<void>;
};

const quietErrors = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

export function useFirebaseSession(auth: Auth): [Session, SessionActions] {
  const [session, setSession] = useState<Session>({ kind: "loading" });

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) {
          setSession((current) =>
            current.kind === "signed-out" ? current : { kind: "signed-out" },
          );
          return;
        }
        const token = await user.getIdTokenResult();
        setSession({
          kind: "signed-in",
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
          },
          role: isAdminRole(token.claims.role) ? token.claims.role : null,
          anonymous: user.isAnonymous,
        });
      }),
    [auth],
  );

  const signIn = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      if (!quietErrors.has(code))
        setSession({
          kind: "signed-out",
          error:
            code === "auth/popup-blocked"
              ? "The sign-in window was blocked. Allow pop-ups for this site and try again."
              : "Sign-in failed. Please try again.",
        });
    }
  }, [auth]);

  const actions = useMemo<SessionActions>(
    () => ({
      signIn,
      signOut: () => signOut(auth),
      refresh: async () => {
        await auth.currentUser?.getIdToken(true);
      },
    }),
    [auth, signIn],
  );
  return [session, actions];
}
