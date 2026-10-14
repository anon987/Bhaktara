import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { displayNameSchema, MergeSummary } from "../../domain/account";
import type { AccountRepository } from "../../repositories/accountRepository";
import { practiceFailure } from "../../repositories/progressionRepository";
import {
  AccountAuth,
  GoogleAccount,
  GoogleSignInProvider,
} from "./accountClient";

// Guest → Google upgrade, merge and sign-out (doc 21 §3, §6).

// A merge that has not reached the server yet. Written before the call, so
// neither a failed call nor a crash can drop it; cleared on success, or when
// the server says it can never succeed (see mergeFailure).
const pendingMergeSchema = z.object({
  guestIdToken: z.string().min(20),
  guestUid: z.string().min(1),
  // The Google account the guest's progress belongs to.
  accountUid: z.string().min(1),
  at: z.number(),
  attempts: z.number().int().nonnegative(),
});
export type PendingMerge = z.infer<typeof pendingMergeSchema>;
export interface PendingMergeStore {
  read(): Promise<PendingMerge | null>;
  write(value: PendingMerge | null): Promise<void>;
}
const PENDING_KEY = "bhaktara.account.pendingMerge.v1";
export const pendingMergeStore: PendingMergeStore = {
  async read() {
    const value = await AsyncStorage.getItem(PENDING_KEY);
    if (!value) return null;
    try {
      return pendingMergeSchema.parse(JSON.parse(value));
    } catch {
      return null;
    }
  },
  async write(value) {
    if (value) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(PENDING_KEY);
  },
};

export type SignInFailure =
  "offline" | "playServices" | "inProgress" | "unavailable" | "error";
export type SignInOutcome =
  // The guest became the Google account (same UID, nothing to merge).
  | { kind: "linked"; account: GoogleAccount }
  // Switched to the existing account and the guest's progress was added.
  | { kind: "merged"; account: GoogleAccount; summary: MergeSummary }
  // Switched; the merge is saved on the device and retried at next launch.
  | { kind: "mergePending"; account: GoogleAccount }
  // Switched, but the guest's progress can no longer be joined.
  | { kind: "mergeLost"; account: GoogleAccount }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: SignInFailure };

const codeOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

// Google sheet and Firebase Auth errors in the terms the screen explains.
export function signInFailure(error: unknown): SignInFailure {
  const code = codeOf(error).replace(/^(auth|google|functions)\//, "");
  if (code === "not-configured") return "unavailable";
  if (code === "play-services") return "playServices";
  if (code === "in-progress") return "inProgress";
  if (
    [
      "network",
      "network-request-failed",
      "unavailable",
      "deadline-exceeded",
      "internal",
      "too-many-requests",
    ].includes(code)
  )
    return "offline";
  return "error";
}

// What a merge call came to. "lost": it can never succeed (the guest token
// expired after its hour, or the guest is gone or merged elsewhere) and the
// devotee is told; "dropped": nothing left to merge, said nothing.
export type MergeResult =
  | { kind: "merged"; summary: MergeSummary }
  | { kind: "pending" }
  | { kind: "lost" }
  | { kind: "dropped" };
const lostReasons = [
  "GUEST_TOKEN_EXPIRED",
  "GUEST_TOKEN_INVALID",
  "GUEST_NOT_ANONYMOUS",
  "ALREADY_MERGED_ELSEWHERE",
];
const droppedReasons = ["SAME_ACCOUNT", "GUEST_NOT_FOUND"];
export function mergeFailure(error: unknown): "pending" | "lost" | "dropped" {
  const failure = practiceFailure(error);
  if (failure.kind !== "rejected") return "pending";
  if (lostReasons.includes(failure.reason)) return "lost";
  if (droppedReasons.includes(failure.reason)) return "dropped";
  // SIGN_IN_REQUIRED and anything unknown: keep it and try again later.
  return "pending";
}

export type AccountFlow = {
  signInWithGoogle(): Promise<SignInOutcome>;
  // Retries a saved merge while signed in to its account. Null when there is
  // nothing to merge or it belongs to another account.
  retryPendingMerge(): Promise<MergeResult | null>;
  hasPendingMerge(): Promise<boolean>;
  // Signs out, then starts a fresh guest session (best effort: the session
  // service creates one later if this fails offline).
  signOut(): Promise<void>;
};

export function createAccountFlow({
  auth,
  google,
  callables,
  pending = pendingMergeStore,
  now = Date.now,
}: {
  auth: AccountAuth;
  google?: GoogleSignInProvider;
  callables: AccountRepository;
  pending?: PendingMergeStore;
  now?: () => number;
}): AccountFlow {
  // Name from the Google profile, only when the devotee has none. Photos are
  // never imported (keys only, D-031): the profile offers "your own photo".
  const adoptGoogleName = async (account: GoogleAccount) => {
    try {
      const user = auth.current();
      const name = displayNameSchema.safeParse(account.name ?? "");
      if (!user || !name.success) return;
      const profile = await auth.readProfile(user.uid);
      if (profile.displayName) return;
      await callables.updateProfile({ displayName: name.data });
    } catch {
      // Optional nicety; the devotee can type a name in Edit profile.
    }
  };
  const merge = async (entry: PendingMerge): Promise<MergeResult> => {
    try {
      // A repeat answers alreadyMerged: true with the stored summary.
      const summary = await callables.mergeGuestAccount({
        guestIdToken: entry.guestIdToken,
      });
      await pending.write(null).catch(() => undefined);
      return { kind: "merged", summary };
    } catch (error) {
      const kind = mergeFailure(error);
      await pending
        .write(
          kind === "pending"
            ? { ...entry, attempts: entry.attempts + 1 }
            : null,
        )
        .catch(() => undefined);
      return { kind };
    }
  };
  return {
    async signInWithGoogle() {
      if (!google) return { kind: "failed", reason: "unavailable" };
      const guest = auth.current();
      let account: GoogleAccount | null;
      try {
        account = await google.signIn();
      } catch (error) {
        return { kind: "failed", reason: signInFailure(error) };
      }
      if (!account) return { kind: "cancelled" };
      // Not a guest (or no session yet): a plain sign-in.
      if (!guest?.isAnonymous) {
        try {
          await auth.signInGoogle(account.idToken);
        } catch (error) {
          return { kind: "failed", reason: signInFailure(error) };
        }
        await adoptGoogleName(account);
        return { kind: "linked", account };
      }
      try {
        await auth.linkGoogle(account.idToken);
        await adoptGoogleName(account);
        return { kind: "linked", account };
      } catch (error) {
        if (
          codeOf(error).replace(/^auth\//, "") !== "credential-already-in-use"
        )
          return { kind: "failed", reason: signInFailure(error) };
      }
      // The Google account already has Bhaktara data: capture the guest's
      // token BEFORE switching, switch, then merge (doc 21 §3).
      let guestIdToken: string;
      try {
        guestIdToken = await auth.getIdToken();
        await auth.signInGoogle(account.idToken);
      } catch (error) {
        return { kind: "failed", reason: signInFailure(error) };
      }
      const accountUid = auth.current()?.uid ?? "";
      const entry: PendingMerge = {
        guestIdToken,
        guestUid: guest.uid,
        accountUid,
        at: now(),
        attempts: 0,
      };
      try {
        await pending.write(entry);
      } catch {
        // Storage is full or broken; still try the merge right away.
      }
      const result = await merge(entry);
      if (result.kind === "merged")
        return { kind: "merged", account, summary: result.summary };
      if (result.kind === "lost") return { kind: "mergeLost", account };
      // Nothing to join (e.g. the guest was already gone): plainly signed in.
      if (result.kind === "dropped") return { kind: "linked", account };
      return { kind: "mergePending", account };
    },
    async retryPendingMerge() {
      const entry = await pending.read().catch(() => null);
      const user = auth.current();
      if (!entry || !user || user.uid !== entry.accountUid) return null;
      return merge(entry);
    },
    async hasPendingMerge() {
      return Boolean(await pending.read().catch(() => null));
    },
    async signOut() {
      await google?.signOut().catch(() => undefined);
      await auth.signOut();
      await auth.signInAnonymously().catch(() => undefined);
    },
  };
}
