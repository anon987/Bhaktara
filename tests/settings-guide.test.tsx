import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppProvider } from "../src/app/providers/AppProvider";
import { SettingsGuideOverlay } from "../src/features/content/SettingsGuideOverlay";
import { settingsGuide } from "../src/services/platform/settingsGuide";
import { localStore, initialState } from "../src/services/storage/localStore";

beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "hi" });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  act(() => settingsGuide.hide());
  jest.restoreAllMocks();
});

test("the picture-in-picture guide appears only while the permission screen is open", async () => {
  const screen = render(
    <AppProvider>
      <SettingsGuideOverlay />
    </AppProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryByText("स्विच चालू करें")).toBeNull();
  act(() => settingsGuide.show());
  await waitFor(() => expect(screen.getByText("स्विच चालू करें")).toBeTruthy());
  expect(screen.getByText("भक्तारा अपने आप लौट आएगा")).toBeTruthy();
  act(() => settingsGuide.hide());
  expect(screen.queryByText("स्विच चालू करें")).toBeNull();
});
