import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useApp } from "../../app/providers/AppProvider";
import { MergeSummary } from "../../domain/account";
import type { StoredProfile } from "../../services/account/accountClient";
import {
  AccountFlow,
  createAccountFlow,
  PendingMergeStore,
  SignInOutcome,
} from "../../services/account/accountFlow";
import { nameDraft, profileCache } from "../../services/account/profileStore";
import { useOptionalProgression } from "../sadhana/ProgressionProvider";
import { uploadProfilePhoto, UploadStep } from "./photo";

// The devotee's account for the Profile screens: who is signed in, their
// name and photo, Google sign-in with the guest merge, and sign-out.

type AccountValue = {
  // False in fixture mode or before the backend is ready.
  available: boolean;
  isGuest: boolean;
  email: string | null;
  profile: StoredProfile;
  busy: "signIn" | "signOut" | null;
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  saveName(name: string): Promise<void>;
  setPhoto(uri: string, onStep?: (step: UploadStep) => void): Promise<void>;
  removePhoto(): Promise<void>;
  // The guest progress added to this account (shown once, then dismissed).
  merged: MergeSummary | null;
  // A saved merge the server can no longer do (e.g. the guest token expired).
  mergeLost: boolean;
  dismissMerged(): void;
  // A merge saved on the device that will be retried.
  mergePending: boolean;
};

const emptyProfile: StoredProfile = { displayName: null, photoKey: null };
const Context = createContext<AccountValue | null>(null);

export function AccountProvider({
  children,
  pendingStore,
}: React.PropsWithChildren<{ pendingStore?: PendingMergeStore }>) {
  const { account, session, refreshSession, update } = useApp();
  const progression = useOptionalProgression();
  const refreshProgress = progression?.refresh;
  const uid = session?.uid ?? null;
  const [profile, setProfile] = useState<StoredProfile>(emptyProfile);
  const [busy, setBusy] = useState<AccountValue["busy"]>(null);
  const [merged, setMerged] = useState<MergeSummary | null>(null);
  const [mergePending, setMergePending] = useState(false);
  const [mergeLost, setMergeLost] = useState(false);
  const flow = useMemo<AccountFlow | null>(
    () =>
      account
        ? createAccountFlow({
            auth: account.auth,
            google: account.google,
            callables: account.callables,
            ...(pendingStore ? { pending: pendingStore } : {}),
          })
        : null,
    [account, pendingStore],
  );
  // The account being shown; answers for an account signed out meanwhile
  // are dropped.
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  const store = useCallback((owner: string, next: StoredProfile) => {
    if (uidRef.current !== owner) return;
    setProfile(next);
    profileCache.write(owner, next).catch(() => undefined);
  }, []);

  // The cached profile first (offline), then the server's.
  const loadProfile = useCallback(
    async (owner: string) => {
      const cached = await profileCache.read(owner).catch(() => null);
      if (uidRef.current === owner) setProfile(cached ?? emptyProfile);
      if (!account) return;
      try {
        store(owner, await account.auth.readProfile(owner));
      } catch {
        // Offline: the cached profile stays.
      }
    },
    [account, store],
  );
  useEffect(() => {
    if (uid) void loadProfile(uid);
  }, [uid, loadProfile]);

  // A merge that failed earlier is retried at launch and whenever the app
  // comes back to the front: the guest's ID token lasts only an hour
  // (doc 21 §3).
  const retryMerge = useCallback(async () => {
    if (!flow) return;
    const result = await flow.retryPendingMerge().catch(() => null);
    setMergePending(await flow.hasPendingMerge().catch(() => false));
    if (result?.kind === "merged") {
      setMerged(result.summary);
      void refreshProgress?.();
    }
    if (result?.kind === "lost") setMergeLost(true);
  }, [flow, refreshProgress]);
  useEffect(() => {
    if (!uid) return;
    const first = setTimeout(() => void retryMerge(), 0);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void retryMerge();
    });
    return () => {
      clearTimeout(first);
      listener.remove();
    };
  }, [uid, retryMerge]);

  const signIn = useCallback(async (): Promise<SignInOutcome> => {
    if (!flow) return { kind: "failed", reason: "unavailable" };
    setBusy("signIn");
    try {
      const outcome = await flow.signInWithGoogle();
      if (outcome.kind === "merged") setMerged(outcome.summary);
      if (outcome.kind === "mergePending") setMergePending(true);
      if (
        outcome.kind === "linked" ||
        outcome.kind === "merged" ||
        outcome.kind === "mergePending" ||
        outcome.kind === "mergeLost"
      ) {
        const current = await refreshSession().catch(() => null);
        if (current) await loadProfile(current.uid);
        // Same UID after linking or merging: progress changed underneath.
        void refreshProgress?.();
      }
      return outcome;
    } finally {
      setBusy(null);
    }
  }, [flow, refreshSession, loadProfile, refreshProgress]);

  const signOut = useCallback(async () => {
    if (!flow) return;
    setBusy("signOut");
    try {
      await flow.signOut();
      // Doc 21 §6: clear this account's caches on the device; its data stays
      // on the server for the next sign-in.
      await Promise.all([profileCache.clear(), nameDraft.clear()]).catch(
        () => undefined,
      );
      update((state) => ({ ...state, favorites: [] }));
      setProfile(emptyProfile);
      setMerged(null);
      setMergeLost(false);
      await refreshSession().catch(() => null);
    } finally {
      setBusy(null);
    }
  }, [flow, refreshSession, update]);

  const saveName = useCallback(
    async (name: string) => {
      if (!account || !uid) throw new Error("unavailable");
      const result = await account.callables.updateProfile({
        displayName: name,
      });
      store(uid, {
        displayName: result.displayName,
        photoKey: result.photoKey,
      });
    },
    [account, uid, store],
  );
  const setPhoto = useCallback(
    async (uri: string, onStep?: (step: UploadStep) => void) => {
      if (!account || !uid) throw new Error("unavailable");
      const result = await uploadProfilePhoto(uri, {
        callables: account.callables,
        onStep,
      });
      store(uid, {
        displayName: result.displayName,
        photoKey: result.photoKey,
      });
    },
    [account, uid, store],
  );
  const removePhoto = useCallback(async () => {
    if (!account || !uid) throw new Error("unavailable");
    const result = await account.callables.updateProfile({ photoKey: null });
    store(uid, { displayName: result.displayName, photoKey: null });
  }, [account, uid, store]);

  const user = account?.auth.current() ?? null;
  const value = useMemo<AccountValue>(
    () => ({
      available: Boolean(account && uid),
      isGuest: !session || session.isAnonymous,
      email: session && !session.isAnonymous ? (user?.email ?? null) : null,
      profile: uid ? profile : emptyProfile,
      busy,
      signIn,
      signOut,
      saveName,
      setPhoto,
      removePhoto,
      merged,
      mergeLost,
      dismissMerged: () => {
        setMerged(null);
        setMergeLost(false);
      },
      mergePending,
    }),
    [
      account,
      uid,
      session,
      user?.email,
      profile,
      busy,
      signIn,
      signOut,
      saveName,
      setPhoto,
      removePhoto,
      merged,
      mergeLost,
      mergePending,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

const fallback: AccountValue = {
  available: false,
  isGuest: true,
  email: null,
  profile: emptyProfile,
  busy: null,
  signIn: async () => ({ kind: "failed", reason: "unavailable" }),
  signOut: async () => undefined,
  saveName: async () => {
    throw new Error("unavailable");
  },
  setPhoto: async () => {
    throw new Error("unavailable");
  },
  removePhoto: async () => {
    throw new Error("unavailable");
  },
  merged: null,
  mergeLost: false,
  dismissMerged: () => undefined,
  mergePending: false,
};
// Screens rendered without the provider (tests, previews) act as a guest
// without an account backend.
export function useAccount(): AccountValue {
  return useContext(Context) ?? fallback;
}
