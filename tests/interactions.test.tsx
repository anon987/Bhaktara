import { DialogProvider } from "../src/components/Dialog";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { OnboardingScreen } from "../src/features/onboarding/OnboardingScreen";
import {
  JaapScreen,
  MeditationScreen,
  PrayerScreen,
} from "../src/features/sadhana/PracticeScreens";
import { localStore, initialState } from "../src/services/storage/localStore";
import { Txt } from "../src/components/ui";
import { localPracticeDay } from "../src/domain/practice";
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function Status() {
  const { local } = useApp();
  return <Txt testID="state">{JSON.stringify(local)}</Txt>;
}
function Wrapper({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <DialogProvider>
          {children}
          <Status />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
// Screens only call goBack in these isolated tests; navigation behavior is checked in the smoke run.
const navigation = { goBack: jest.fn() };
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});
test("onboarding asks only for language and persists the choice", async () => {
  const screen = render(<OnboardingScreen />, { wrapper: Wrapper });
  await waitFor(() =>
    expect(screen.getByText("Choose your language")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("हिन्दी"));
  fireEvent.press(screen.getByText("आगे बढ़ें"));
  await waitFor(() =>
    expect(localStore.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: "hi", onboarded: true }),
    ),
  );
  expect(screen.queryByText("Continue with Google")).toBeNull();
});
test("108 jaap taps complete one local mala without creating XP", async () => {
  const screen = render(
    <JaapScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(screen.getByText("Jaap counter")).toBeTruthy());
  for (let count = 0; count < 108; count++)
    fireEvent.press(screen.getByTestId("jaap-counter"));
  const state = JSON.parse(screen.getByTestId("state").props.children);
  expect(state.jaapCount).toBe(108);
  expect(state.days[localPracticeDay()].jaap).toBe(true);
  expect(state.totalXp).toBeUndefined();
});
test("prayer requires all checklist items and remains completed", async () => {
  const screen = render(
    <PrayerScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getByText("Prayer checklist")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Continue"));
  expect(JSON.parse(screen.getByTestId("state").props.children).days).toEqual(
    {},
  );
  for (const label of [
    "Take a moment of gratitude",
    "Set a gentle intention for today",
    "Reflect quietly on your day",
  ]) {
    fireEvent.press(screen.getByText(label));
  }
  fireEvent.press(screen.getByText("Continue"));
  expect(
    JSON.parse(screen.getByTestId("state").props.children).days[
      localPracticeDay()
    ].prayer,
  ).toBe(true);
});
test("elapsed meditation restored from storage completes locally", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    timer: {
      durationSeconds: 300,
      remainingSeconds: 300,
      endsAt: Date.now() - 1000,
    },
  });
  const screen = render(
    <MeditationScreen navigation={navigation as never} route={{} as never} />,
    { wrapper: Wrapper },
  );
  await waitFor(() =>
    expect(screen.getByText("A peaceful moment, well spent.")).toBeTruthy(),
  );
  await waitFor(() =>
    expect(
      JSON.parse(screen.getByTestId("state").props.children).days[
        localPracticeDay()
      ]?.meditation,
    ).toBe(true),
  );
  await act(async () => {
    await Promise.resolve();
  });
});
