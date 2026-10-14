import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { ProgressionProvider } from "../src/features/sadhana/ProgressionProvider";
import { SadhanaScreen } from "../src/features/sadhana/SadhanaScreen";
import { initialState, localStore } from "../src/services/storage/localStore";

// Sadhana > League: a signed-in devotee is never asked to sign in again; a
// guest gets one button that runs the real Google sign-in.

const mockAccount = {
  current: {
    available: true,
    isGuest: true,
    email: null as string | null,
    profile: { displayName: null as string | null, photoKey: null },
    busy: null,
    signIn: jest.fn(async () => ({ kind: "cancelled" as const })),
    signOut: jest.fn(async () => undefined),
    saveName: jest.fn(),
    setPhoto: jest.fn(),
    removePhoto: jest.fn(),
    merged: null,
    mergeLost: false,
    dismissMerged: jest.fn(),
    mergePending: false,
  },
};
jest.mock("../src/features/profile/AccountProvider", () => ({
  useAccount: () => mockAccount.current,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 760 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function Wrapper({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <DialogProvider>
          <ProgressionProvider>{children}</ProgressionProvider>
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

async function openLeague() {
  const screen = render(
    <SadhanaScreen
      navigation={{ navigate: jest.fn() } as never}
      route={{} as never}
    />,
    { wrapper: Wrapper },
  );
  const tab = await waitFor(() => screen.getByRole("tab", { name: "League" }));
  fireEvent.press(tab);
  await waitFor(() =>
    expect(
      screen.getByRole("tab", { name: "League" }).props.accessibilityState,
    ).toMatchObject({ selected: true }),
  );
  return screen;
}

jest.setTimeout(30000);
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
  mockAccount.current.signIn.mockClear();
});
afterEach(() => jest.restoreAllMocks());

test("a signed-in devotee sees their league and no sign-in prompt", async () => {
  mockAccount.current = {
    ...mockAccount.current,
    isGuest: false,
    email: "devotee@example.com",
    profile: { displayName: "Sita", photoKey: null },
  };
  const screen = await openLeague();
  expect(await screen.findByText("Sita")).toBeTruthy();
  expect(screen.getByText("You’re in")).toBeTruthy();
  expect(screen.getByText("Bronze league")).toBeTruthy();
  expect(screen.getByText("Leagues open soon")).toBeTruthy();
  expect(screen.queryByText("Continue with Google")).toBeNull();
});

test("a guest gets one sign-in button that runs the Google sign-in", async () => {
  mockAccount.current = {
    ...mockAccount.current,
    isGuest: true,
    email: null,
    profile: { displayName: null, photoKey: null },
  };
  const screen = await openLeague();
  const buttons = await waitFor(() =>
    screen.getAllByRole("button", { name: "Continue with Google" }),
  );
  expect(buttons).toHaveLength(1);
  fireEvent.press(buttons[0]);
  await waitFor(() => expect(mockAccount.current.signIn).toHaveBeenCalled());
});
