import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { MergeSummary } from "../src/domain/account";
import { emptyCounters } from "../src/domain/progression";
import { AccountProvider } from "../src/features/profile/AccountProvider";
import {
  EditProfileScreen,
  nameProblem,
  profileProblem,
} from "../src/features/profile/EditProfileScreen";
import { groupMilestones } from "../src/features/profile/milestones";
import { MilestonesScreen } from "../src/features/profile/MilestonesScreen";
import { pickPhoto, preparePhoto } from "../src/features/profile/photo";
import { ProfileScreen } from "../src/features/profile/ProfileScreen";
import { codedError } from "../src/repositories/firestoreErrors";
import { deviceFavoritesRepository } from "../src/repositories/favoritesRepository";
import { mockContentRepository } from "../src/repositories/mockRepository";
import {
  BadgeView,
  ProgressSnapshot,
} from "../src/repositories/progressionRepository";
import {
  AccountBackend,
  AccountUser,
  StoredProfile,
} from "../src/services/account/accountClient";
import {
  PendingMerge,
  PendingMergeStore,
} from "../src/services/account/accountFlow";
import { Backend } from "../src/services/backend";
import { setRuntimeMediaBaseUrl } from "../src/services/media/config";
import { initialState, localStore } from "../src/services/storage/localStore";

// Milestones read the progression snapshot; tests set it directly.
const mockProgression: { current: unknown } = { current: null };
jest.mock("../src/features/sadhana/ProgressionProvider", () => ({
  ...jest.requireActual("../src/features/sadhana/ProgressionProvider"),
  useOptionalProgression: () => mockProgression.current,
}));
// The picker and resizer are native; the upload sequence stays real.
jest.mock("../src/features/profile/photo", () => ({
  ...jest.requireActual("../src/features/profile/photo"),
  pickPhoto: jest.fn(),
  preparePhoto: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const summary: MergeSummary = {
  alreadyMerged: false,
  xpAdded: 40,
  badgesAdded: 1,
  favoritesAdded: 0,
  daysAdded: 3,
};
const UPLOAD = {
  key: "users/u1/photo.abc123.jpg",
  uploadUrl: "https://uploads.example.com/users/u1/photo.abc123.jpg?sig=1",
  headers: { "Content-Type": "image/jpeg", "x-goog-meta-uid": "u1" },
  expiresAt: "2026-10-14T12:00:00Z",
};

function fakeAccount(
  start: AccountUser,
  stored: StoredProfile = { displayName: null, photoKey: null },
) {
  let user = start;
  let profile = stored;
  const account = {
    callables: {
      updateProfile: jest.fn(
        async (input: { displayName?: string; photoKey?: string | null }) => {
          profile = {
            displayName: input.displayName ?? profile.displayName,
            photoKey:
              input.photoKey === undefined ? profile.photoKey : input.photoKey,
          };
          return profile;
        },
      ),
      requestProfilePhotoUpload: jest.fn(async () => UPLOAD),
      mergeGuestAccount: jest.fn(async () => summary),
    },
    auth: {
      current: () => user,
      getIdToken: jest.fn(async () => "guest-id-token-0123456789abcdef"),
      linkGoogle: jest.fn(async () => {
        user = { ...user, isAnonymous: false, email: "r@example.com" };
      }),
      signInGoogle: jest.fn(async () => undefined),
      signOut: jest.fn(async () => undefined),
      signInAnonymously: jest.fn(async () => undefined),
      readProfile: jest.fn(async () => profile),
    },
    google: {
      signIn: jest.fn(async () => ({
        idToken: "google-id-token",
        name: "Ramesh Sharma",
        email: "r@example.com",
      })),
      signOut: jest.fn(async () => undefined),
    },
  } satisfies AccountBackend;
  const backend: Backend = {
    mode: "emulator",
    content: mockContentRepository,
    favorites: deviceFavoritesRepository,
    session: {
      ensureSession: async () => ({
        uid: user.uid,
        isAnonymous: user.isAnonymous,
      }),
    },
    account,
  };
  return { account, backend };
}
const guestUser: AccountUser = {
  uid: "u1",
  isAnonymous: true,
  providerName: null,
  email: null,
};
const fixtureBackend: Backend = {
  mode: "fixture",
  content: mockContentRepository,
  favorites: deviceFavoritesRepository,
  session: { ensureSession: async () => null },
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
function renderScreen(
  Screen: React.ElementType,
  backend: Backend,
  pendingStore?: PendingMergeStore,
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend}>
        <DialogProvider>
          <AccountProvider pendingStore={pendingStore}>
            <Screen navigation={navigation} route={{}} />
          </AccountProvider>
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>,
  );
}
const noPending = (): PendingMergeStore => ({
  read: async () => null,
  write: async () => undefined,
});

const badge = (
  id: string,
  criteriaType: BadgeView["criteriaType"],
  criteriaValue: number | string,
  iconKey: string,
  unlockedAt: Date | null = null,
): BadgeView => ({
  id,
  name: { en: id, hi: id },
  description: { en: `${id} description`, hi: id },
  iconKey,
  unlocked: unlockedAt !== null,
  unlockedAt,
  criteriaType,
  criteriaValue,
});
const badges = [
  badge("xp-1000", "TOTAL_XP", 1000, "star"),
  badge("streak-21", "STREAK_DAYS", 21, "diya"),
  badge("pehli-sadhana", "SADHANA_TASKS", 1, "lotus", new Date(2026, 9, 3)),
  badge("streak-7", "STREAK_DAYS", 7, "diya", new Date(2026, 9, 9)),
  badge("league-gold", "LEAGUE_TIER", "GOLD", "crown"),
  badge("pehli-mala", "TOTAL_MALAS", 1, "mala"),
];
const counters = { ...emptyCounters(), sadhanaTasks: 9, malas: 0 };
const snapshot = {
  totalXp: 320,
  level: 3,
  rank: "SADHAK",
  currentStreak: 12,
  longestStreak: 12,
  counters: { ...counters, meditationMinutes: 45, mandirVisits: 5 },
  badges,
} as unknown as ProgressSnapshot;

jest.setTimeout(30_000);
beforeEach(() => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    onboarded: true,
  });
  jest.spyOn(localStore, "write").mockResolvedValue();
  mockProgression.current = null;
  navigation.navigate.mockClear();
  jest.mocked(AsyncStorage.setItem).mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("Profile tab", () => {
  test("a guest sees the default devotee, a gentle sign-in card and no favorites", async () => {
    renderScreen(ProfileScreen, fixtureBackend);
    expect(await screen.findByText("Guest")).toBeTruthy();
    expect(screen.getByTestId("avatar-default")).toBeTruthy();
    expect(screen.getByText("Keep your progress safe")).toBeTruthy();
    expect(screen.queryByText("Your favorites")).toBeNull();
    expect(screen.queryByText("Keep what speaks to you")).toBeNull();
    // Milestones are one tap away.
    fireEvent.press(screen.getByText("Milestones"));
    expect(navigation.navigate).toHaveBeenCalledWith("Milestones");
    fireEvent.press(screen.getByText("Edit profile"));
    expect(navigation.navigate).toHaveBeenCalledWith("EditProfile");
    // No backend: sign-in explains itself instead of failing.
    fireEvent.press(screen.getAllByText("Continue with Google")[0]);
    expect(
      await screen.findByText(
        "Google sign-in is not connected. You can keep using the app as a guest.",
      ),
    ).toBeTruthy();
  });

  test("a signed-in devotee sees their name, photo, stats and sign-out", async () => {
    setRuntimeMediaBaseUrl("https://media.example.com");
    mockProgression.current = { snapshot, status: "ready", refresh: jest.fn() };
    const { backend } = fakeAccount(
      { uid: "acct", isAnonymous: false, providerName: null, email: "r@x.in" },
      { displayName: "Ramesh Sharma", photoKey: "users/acct/photo.1.jpg" },
    );
    renderScreen(ProfileScreen, backend, noPending());
    expect(await screen.findByText("Ramesh Sharma")).toBeTruthy();
    expect(screen.getByTestId("avatar-photo").props.source).toEqual({
      uri: "https://media.example.com/users/acct/photo.1.jpg",
    });
    expect(screen.getByText("r@x.in")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Keep your progress safe")).toBeNull();
    // Stats from the progression snapshot; 2 of 6 milestones earned.
    expect(screen.getByText("12 days")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("2 / 6 earned")).toBeTruthy();
    setRuntimeMediaBaseUrl("");
  });

  test("a guest signs in with Google and is told their progress is safe", async () => {
    const { backend, account } = fakeAccount(guestUser);
    renderScreen(ProfileScreen, backend, noPending());
    await screen.findByText("Keep your progress safe");
    await act(async () => {
      fireEvent.press(screen.getAllByText("Continue with Google")[0]);
    });
    expect(account.auth.linkGoogle).toHaveBeenCalledWith("google-id-token");
    expect(await screen.findByText("You are signed in")).toBeTruthy();
    // The Google name is used because the guest had none.
    expect(account.callables.updateProfile).toHaveBeenCalledWith({
      displayName: "Ramesh Sharma",
    });
    await waitFor(() =>
      expect(screen.queryByText("Keep your progress safe")).toBeNull(),
    );
  });

  test("a merge saved on the device is retried at launch and its summary shown", async () => {
    const entry: PendingMerge = {
      guestIdToken: "guest-id-token-0123456789abcdef",
      guestUid: "old-guest",
      accountUid: "acct",
      at: 0,
      attempts: 1,
    };
    const store: PendingMergeStore & { value: PendingMerge | null } = {
      value: entry,
      read: jest.fn(async () => store.value),
      write: jest.fn(async (value) => {
        store.value = value;
      }),
    };
    const { backend, account } = fakeAccount({
      uid: "acct",
      isAnonymous: false,
      providerName: null,
      email: null,
    });
    renderScreen(ProfileScreen, backend, store);
    expect(
      await screen.findByText(
        "Your guest progress has been added to your account.",
      ),
    ).toBeTruthy();
    expect(account.callables.mergeGuestAccount).toHaveBeenCalledWith({
      guestIdToken: entry.guestIdToken,
    });
    expect(screen.getByText("+40 XP · 3 days · 1 Milestones")).toBeTruthy();
    expect(store.value).toBeNull();
  });
});

describe("Milestones", () => {
  test("badges are grouped by practice with progress towards each", () => {
    const groups = groupMilestones(badges, {
      counters,
      longestStreak: 12,
      totalXp: 320,
    });
    expect(groups.map((group) => group.id)).toEqual([
      "sadhana",
      "jaap",
      "league",
      "xp",
    ]);
    expect(groups[0].items.map((item) => item.badge.id)).toEqual([
      "pehli-sadhana",
      "streak-7",
      "streak-21",
    ]);
    expect(groups[0].items[2].progress).toEqual({
      current: 12,
      target: 21,
      unit: "daysUnit",
    });
    expect(groups[2].items[0].progress).toBeNull();
    expect(groups[3].items[0].progress).toEqual({
      current: 320,
      target: 1000,
      unit: "points",
    });
  });

  test("earned medallions show their date, locked ones how far along", async () => {
    mockProgression.current = { snapshot, status: "ready", refresh: jest.fn() };
    renderScreen(MilestonesScreen, fixtureBackend);
    expect(await screen.findByText("Sadhana")).toBeTruthy();
    for (const title of ["Jaap", "League", "Points"])
      expect(screen.getByText(title)).toBeTruthy();
    expect(
      screen.getByTestId("milestone-streak-7").props.accessibilityLabel,
    ).toMatch(/Earned on .*2026/);
    expect(screen.getByText("12 / 21 days")).toBeTruthy();
    expect(screen.getByText("0 / 1 malas")).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByText("Milestones")).toBeTruthy();
    expect(screen.getByText("2 / 6 earned")).toBeTruthy();
  });

  test("without progress it says so and offers a retry", async () => {
    const refresh = jest.fn(async () => undefined);
    mockProgression.current = { snapshot: null, status: "offline", refresh };
    renderScreen(MilestonesScreen, fixtureBackend);
    expect(
      await screen.findByText(
        "Milestones appear when Bhaktara is connected to the internet.",
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("Edit profile", () => {
  test("names are checked in plain words", () => {
    expect(nameProblem("राधा")).toBeNull();
    expect(nameProblem("Ramesh Sharma")).toBeNull();
    expect(nameProblem(" र ")).toBe("nameShort");
    expect(nameProblem("R2D2")).toBe("nameLetters");
    expect(nameProblem("a".repeat(31))).toBe("nameLong");
  });

  test("server refusals become plain messages", () => {
    const rejected = (code: string, reason: string) =>
      Object.assign(codedError(code, reason), { details: { reason } });
    const offline = codedError("functions/unavailable", "offline");
    expect(
      profileProblem(
        rejected("functions/invalid-argument", "DISPLAY_NAME_NOT_ALLOWED"),
        "name",
      ),
    ).toBe("nameRejected");
    const limited = rejected("functions/resource-exhausted", "RATE_LIMITED");
    expect(profileProblem(limited, "name")).toBe("nameRateLimited");
    expect(profileProblem(limited, "photo")).toBe("photoRateLimited");
    expect(
      profileProblem(
        rejected("functions/failed-precondition", "PHOTO_NOT_UPLOADED"),
        "photo",
      ),
    ).toBe("photoRetry");
    expect(
      profileProblem(
        rejected("functions/failed-precondition", "UPLOADS_NOT_CONFIGURED"),
        "photo",
      ),
    ).toBe("photoUnavailable");
    expect(profileProblem(offline, "name")).toBe("nameOffline");
    expect(profileProblem(offline, "photo")).toBe("photoFailed");
    // A function that is not deployed is not an internet problem.
    const missing = codedError("functions/not-found", "not found");
    expect(profileProblem(missing, "photo")).toBe("photoUnavailable");
    expect(profileProblem(missing, "name")).toBe("nameFailed");
    expect(
      profileProblem(codedError("functions/internal", "boom"), "photo"),
    ).toBe("photoUnavailable");
  });

  test("the name is validated, saved, and kept on the device when offline", async () => {
    const { backend, account } = fakeAccount(guestUser);
    renderScreen(EditProfileScreen, backend, noPending());
    const input = await screen.findByTestId("name-input");
    await waitFor(() =>
      expect(screen.queryByText(/connected to the internet/)).toBeNull(),
    );
    fireEvent.changeText(input, "1");
    fireEvent.press(screen.getByText("Save name"));
    expect(
      await screen.findByText("Please write at least 2 letters."),
    ).toBeTruthy();
    expect(account.callables.updateProfile).not.toHaveBeenCalled();

    account.callables.updateProfile.mockRejectedValueOnce(
      codedError("functions/unavailable", "offline"),
    );
    fireEvent.changeText(input, "Ramesh");
    await act(async () => {
      fireEvent.press(screen.getByText("Save name"));
    });
    expect(
      await screen.findByText(
        "No internet. Your name is kept here; tap Save again when the internet is on.",
      ),
    ).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "bhaktara.account.nameDraft.v1",
      JSON.stringify({ uid: "u1", name: "Ramesh" }),
    );
    expect(input.props.value).toBe("Ramesh");

    await act(async () => {
      fireEvent.press(screen.getByText("Save name"));
    });
    expect(account.callables.updateProfile).toHaveBeenLastCalledWith({
      displayName: "Ramesh",
    });
    expect(await screen.findByText("Your name is saved.")).toBeTruthy();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      "bhaktara.account.nameDraft.v1",
    );
  });

  test("a chosen photo is resized, uploaded to the signed URL, then saved as a key", async () => {
    jest.mocked(pickPhoto).mockResolvedValue({
      kind: "picked",
      photo: { uri: "file:///picked.jpg", width: 1200, height: 900 },
    });
    jest.mocked(preparePhoto).mockResolvedValue("file:///cache/avatar.jpg");
    const blob = { size: 48_000 };
    const fetchMock = jest.fn(async (url: string) =>
      url.startsWith("file:")
        ? { blob: async () => blob }
        : { ok: true, status: 200 },
    );
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { backend, account } = fakeAccount(guestUser);
      renderScreen(EditProfileScreen, backend, noPending());
      await screen.findByText("Choose photo");
      await waitFor(() =>
        expect(screen.queryByText(/connected to the internet/)).toBeNull(),
      );
      await act(async () => {
        fireEvent.press(screen.getByText("Choose photo"));
      });
      expect(await screen.findByText("Your photo is saved.")).toBeTruthy();
      expect(pickPhoto).toHaveBeenCalledWith("library");
      expect(preparePhoto).toHaveBeenCalledWith({
        uri: "file:///picked.jpg",
        width: 1200,
        height: 900,
      });
      const { requestProfilePhotoUpload, updateProfile } = account.callables;
      expect(requestProfilePhotoUpload).toHaveBeenCalledWith({
        contentType: "image/jpeg",
        bytes: 48_000,
      });
      expect(fetchMock).toHaveBeenCalledWith(UPLOAD.uploadUrl, {
        method: "PUT",
        headers: UPLOAD.headers,
        body: blob,
      });
      expect(updateProfile).toHaveBeenCalledWith({ photoKey: UPLOAD.key });
      // Request → PUT → save, in that order.
      const putCall = fetchMock.mock.calls.findIndex(
        ([url]) => url === UPLOAD.uploadUrl,
      );
      expect(
        requestProfilePhotoUpload.mock.invocationCallOrder[0],
      ).toBeLessThan(fetchMock.mock.invocationCallOrder[putCall]);
      expect(fetchMock.mock.invocationCallOrder[putCall]).toBeLessThan(
        updateProfile.mock.invocationCallOrder[0],
      );

      // Remove photo appears once there is one.
      await act(async () => {
        fireEvent.press(screen.getByText("Remove photo"));
      });
      expect(updateProfile).toHaveBeenLastCalledWith({ photoKey: null });
      expect(await screen.findByText("Your photo is removed.")).toBeTruthy();
    } finally {
      global.fetch = realFetch;
    }
  });

  test("a failed upload says so plainly and saves nothing", async () => {
    jest.mocked(pickPhoto).mockResolvedValue({
      kind: "picked",
      photo: { uri: "file:///picked.jpg", width: 512, height: 512 },
    });
    jest.mocked(preparePhoto).mockResolvedValue("file:///cache/avatar.jpg");
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url: string) =>
      url.startsWith("file:")
        ? { blob: async () => ({ size: 1000 }) }
        : { ok: false, status: 403 },
    ) as unknown as typeof fetch;
    try {
      const { backend, account } = fakeAccount(guestUser);
      renderScreen(EditProfileScreen, backend, noPending());
      await screen.findByText("Take photo");
      await waitFor(() =>
        expect(screen.queryByText(/connected to the internet/)).toBeNull(),
      );
      await act(async () => {
        fireEvent.press(screen.getByText("Take photo"));
      });
      expect(pickPhoto).toHaveBeenCalledWith("camera");
      expect(
        await screen.findByText(
          "The photo could not be saved. Please choose it again.",
        ),
      ).toBeTruthy();
      expect(account.callables.updateProfile).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });
});
