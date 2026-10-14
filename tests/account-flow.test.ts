import { MergeSummary } from "../src/domain/account";
import {
  AccountAuth,
  AccountUser,
  GoogleSignInProvider,
} from "../src/services/account/accountClient";
import { AccountRepository } from "../src/repositories/accountRepository";
import {
  createAccountFlow,
  PendingMerge,
  PendingMergeStore,
} from "../src/services/account/accountFlow";
import { codedError } from "../src/repositories/firestoreErrors";

const GUEST_TOKEN = "guest-id-token-0123456789abcdef";
const summary: MergeSummary = {
  alreadyMerged: false,
  xpAdded: 40,
  badgesAdded: 1,
  favoritesAdded: 2,
  daysAdded: 3,
};

// A fake Firebase Auth: one current user; signInGoogle switches to the
// existing Google account "acct".
function fakeAuth(start: AccountUser | null = guest()) {
  const calls: string[] = [];
  let user = start;
  const auth: AccountAuth & { calls: string[] } = {
    calls,
    current: () => user,
    getIdToken: jest.fn(async () => {
      calls.push(`getIdToken:${user?.uid}`);
      return GUEST_TOKEN;
    }),
    linkGoogle: jest.fn(async () => {
      calls.push("link");
      if (user) user = { ...user, isAnonymous: false };
    }),
    signInGoogle: jest.fn(async () => {
      calls.push("signInGoogle");
      user = {
        uid: "acct",
        isAnonymous: false,
        providerName: "Ramesh",
        email: "r@example.com",
      };
    }),
    signOut: jest.fn(async () => {
      calls.push("signOut");
      user = null;
    }),
    signInAnonymously: jest.fn(async () => {
      calls.push("signInAnonymously");
      user = guest("guest-2");
    }),
    readProfile: jest.fn(async () => ({ displayName: null, photoKey: null })),
  };
  return auth;
}
function guest(uid = "guest-1"): AccountUser {
  return { uid, isAnonymous: true, providerName: null, email: null };
}
const google = (
  result: Awaited<ReturnType<GoogleSignInProvider["signIn"]>> = {
    idToken: "google-id-token",
    name: "Ramesh Sharma",
    email: "r@example.com",
  },
): GoogleSignInProvider & { signIn: jest.Mock; signOut: jest.Mock } => ({
  signIn: jest.fn(async () => result),
  signOut: jest.fn(async () => undefined),
});
function callables(): AccountRepository & {
  updateProfile: jest.Mock;
  mergeGuestAccount: jest.Mock;
  requestProfilePhotoUpload: jest.Mock;
} {
  return {
    updateProfile: jest.fn(async (input) => ({
      displayName: input.displayName ?? null,
      photoKey: null,
    })),
    requestProfilePhotoUpload: jest.fn(),
    mergeGuestAccount: jest.fn(async () => summary),
  };
}
function memoryPending(initial: PendingMerge | null = null) {
  const store: PendingMergeStore & { value: PendingMerge | null } = {
    value: initial,
    read: jest.fn(async () => store.value),
    write: jest.fn(async (value: PendingMerge | null) => {
      store.value = value;
    }),
  };
  return store;
}

test("a guest links Google: same account, and the Google name is used only when there is none", async () => {
  const auth = fakeAuth();
  const api = callables();
  const flow = createAccountFlow({
    auth,
    google: google(),
    callables: api,
    pending: memoryPending(),
  });
  await expect(flow.signInWithGoogle()).resolves.toMatchObject({
    kind: "linked",
  });
  expect(auth.linkGoogle).toHaveBeenCalledWith("google-id-token");
  expect(auth.signInGoogle).not.toHaveBeenCalled();
  expect(api.updateProfile).toHaveBeenCalledWith({
    displayName: "Ramesh Sharma",
  });
  expect(api.mergeGuestAccount).not.toHaveBeenCalled();

  // A devotee who already chose a name keeps it.
  const named = fakeAuth();
  jest
    .mocked(named.readProfile)
    .mockResolvedValue({ displayName: "राधा", photoKey: null });
  const api2 = callables();
  await createAccountFlow({
    auth: named,
    google: google(),
    callables: api2,
    pending: memoryPending(),
  }).signInWithGoogle();
  expect(api2.updateProfile).not.toHaveBeenCalled();
});

test("credential-already-in-use: guest token captured before switching, then merged", async () => {
  const auth = fakeAuth();
  jest
    .mocked(auth.linkGoogle)
    .mockRejectedValue(
      codedError("auth/credential-already-in-use", "already linked"),
    );
  const api = callables();
  const pending = memoryPending();
  const outcome = await createAccountFlow({
    auth,
    google: google(),
    callables: api,
    pending,
    now: () => 1000,
  }).signInWithGoogle();
  expect(outcome).toEqual({
    kind: "merged",
    account: expect.objectContaining({ idToken: "google-id-token" }),
    summary,
  });
  // The token belongs to the guest: taken while still signed in as guest.
  expect(auth.calls).toEqual(["getIdToken:guest-1", "signInGoogle"]);
  expect(api.mergeGuestAccount).toHaveBeenCalledWith({
    guestIdToken: GUEST_TOKEN,
  });
  // Saved before the call, cleared after it succeeded.
  expect(pending.write).toHaveBeenNthCalledWith(1, {
    guestIdToken: GUEST_TOKEN,
    guestUid: "guest-1",
    accountUid: "acct",
    at: 1000,
    attempts: 0,
  });
  expect(pending.value).toBeNull();
});

test("a failed merge is kept on the device and retried at the next launch", async () => {
  const auth = fakeAuth();
  jest
    .mocked(auth.linkGoogle)
    .mockRejectedValue(codedError("auth/credential-already-in-use", "x"));
  const api = callables();
  api.mergeGuestAccount.mockRejectedValueOnce(
    codedError("functions/unavailable", "offline"),
  );
  const pending = memoryPending();
  const flow = createAccountFlow({
    auth,
    google: google(),
    callables: api,
    pending,
  });
  await expect(flow.signInWithGoogle()).resolves.toMatchObject({
    kind: "mergePending",
  });
  expect(pending.value).toMatchObject({
    guestIdToken: GUEST_TOKEN,
    accountUid: "acct",
    attempts: 1,
  });
  await expect(flow.hasPendingMerge()).resolves.toBe(true);

  // Next launch, still offline: kept, never dropped.
  api.mergeGuestAccount.mockRejectedValueOnce(
    codedError("functions/unavailable", "offline"),
  );
  const relaunch = createAccountFlow({ auth, callables: api, pending });
  await expect(relaunch.retryPendingMerge()).resolves.toEqual({
    kind: "pending",
  });
  expect(pending.value).toMatchObject({ attempts: 2 });

  // Online again: merged and cleared.
  await expect(relaunch.retryPendingMerge()).resolves.toEqual({
    kind: "merged",
    summary,
  });
  expect(api.mergeGuestAccount).toHaveBeenLastCalledWith({
    guestIdToken: GUEST_TOKEN,
  });
  expect(pending.value).toBeNull();
});

test("a pending merge waits while another account is signed in", async () => {
  const pending = memoryPending({
    guestIdToken: GUEST_TOKEN,
    guestUid: "guest-1",
    accountUid: "acct",
    at: 0,
    attempts: 1,
  });
  const api = callables();
  const flow = createAccountFlow({
    auth: fakeAuth(guest("someone-else")),
    callables: api,
    pending,
  });
  await expect(flow.retryPendingMerge()).resolves.toBeNull();
  expect(api.mergeGuestAccount).not.toHaveBeenCalled();
  expect(pending.value).not.toBeNull();
});

test("cancel, Play Services and network problems are reported plainly", async () => {
  const make = (provider: GoogleSignInProvider) =>
    createAccountFlow({
      auth: fakeAuth(),
      google: provider,
      callables: callables(),
      pending: memoryPending(),
    }).signInWithGoogle();
  await expect(make(google(null))).resolves.toEqual({ kind: "cancelled" });
  const failing = (code: string) => {
    const provider = google();
    provider.signIn.mockRejectedValue(codedError(code, code));
    return provider;
  };
  await expect(make(failing("google/play-services"))).resolves.toEqual({
    kind: "failed",
    reason: "playServices",
  });
  await expect(make(failing("google/network"))).resolves.toEqual({
    kind: "failed",
    reason: "offline",
  });
  await expect(make(failing("google/not-configured"))).resolves.toEqual({
    kind: "failed",
    reason: "unavailable",
  });
  // Linking offline leaves the guest as it was.
  const auth = fakeAuth();
  jest
    .mocked(auth.linkGoogle)
    .mockRejectedValue(codedError("auth/network-request-failed", "offline"));
  await expect(
    createAccountFlow({
      auth,
      google: google(),
      callables: callables(),
      pending: memoryPending(),
    }).signInWithGoogle(),
  ).resolves.toEqual({ kind: "failed", reason: "offline" });
  expect(auth.current()).toMatchObject({ uid: "guest-1", isAnonymous: true });
});

test("sign-out leaves Google, then starts a fresh guest", async () => {
  const auth = fakeAuth({
    uid: "acct",
    isAnonymous: false,
    providerName: null,
    email: null,
  });
  const provider = google();
  await createAccountFlow({
    auth,
    google: provider,
    callables: callables(),
    pending: memoryPending(),
  }).signOut();
  expect(provider.signOut).toHaveBeenCalled();
  expect(auth.calls).toEqual(["signOut", "signInAnonymously"]);
  expect(auth.current()).toMatchObject({ uid: "guest-2", isAnonymous: true });
});

// Server rejections carry details.reason (functions/src/accountMerge.ts).
const rejected = (code: string, reason: string) =>
  Object.assign(codedError(code, reason), { details: { reason } });
const saved = (): PendingMerge => ({
  guestIdToken: GUEST_TOKEN,
  guestUid: "guest-1",
  accountUid: "acct",
  at: 0,
  attempts: 3,
});
const signedIn = () =>
  fakeAuth({
    uid: "acct",
    isAnonymous: false,
    providerName: null,
    email: null,
  });

test("an expired guest token ends the retries and is reported once", async () => {
  const api = callables();
  api.mergeGuestAccount.mockRejectedValue(
    rejected("functions/invalid-argument", "GUEST_TOKEN_EXPIRED"),
  );
  const pending = memoryPending(saved());
  const flow = createAccountFlow({ auth: signedIn(), callables: api, pending });
  await expect(flow.retryPendingMerge()).resolves.toEqual({ kind: "lost" });
  expect(pending.value).toBeNull();
  // Nothing left to retry.
  await expect(flow.retryPendingMerge()).resolves.toBeNull();
  expect(api.mergeGuestAccount).toHaveBeenCalledTimes(1);
});

test("merge rejections: kept when signed out, dropped when nothing to join", async () => {
  const api = callables();
  api.mergeGuestAccount.mockRejectedValueOnce(
    rejected("functions/permission-denied", "SIGN_IN_REQUIRED"),
  );
  const pending = memoryPending(saved());
  const flow = createAccountFlow({ auth: signedIn(), callables: api, pending });
  await expect(flow.retryPendingMerge()).resolves.toEqual({ kind: "pending" });
  expect(pending.value).not.toBeNull();
  api.mergeGuestAccount.mockRejectedValueOnce(
    rejected("functions/not-found", "GUEST_NOT_FOUND"),
  );
  await expect(flow.retryPendingMerge()).resolves.toEqual({ kind: "dropped" });
  expect(pending.value).toBeNull();
});

test("a repeated merge (alreadyMerged) counts as success", async () => {
  const api = callables();
  api.mergeGuestAccount.mockResolvedValue({ ...summary, alreadyMerged: true });
  const pending = memoryPending(saved());
  await expect(
    createAccountFlow({
      auth: signedIn(),
      callables: api,
      pending,
    }).retryPendingMerge(),
  ).resolves.toEqual({
    kind: "merged",
    summary: { ...summary, alreadyMerged: true },
  });
  expect(pending.value).toBeNull();
});

test("signing in when the guest token is refused tells the devotee plainly", async () => {
  const auth = fakeAuth();
  jest
    .mocked(auth.linkGoogle)
    .mockRejectedValue(codedError("auth/credential-already-in-use", "x"));
  const api = callables();
  api.mergeGuestAccount.mockRejectedValue(
    rejected("functions/failed-precondition", "ALREADY_MERGED_ELSEWHERE"),
  );
  const pending = memoryPending();
  await expect(
    createAccountFlow({
      auth,
      google: google(),
      callables: api,
      pending,
    }).signInWithGoogle(),
  ).resolves.toMatchObject({ kind: "mergeLost" });
  expect(pending.value).toBeNull();
});
