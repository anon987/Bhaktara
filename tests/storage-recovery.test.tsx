import React from "react";
import { AppState, Button, Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import {
  initialState,
  localStore,
  LocalState,
} from "../src/services/storage/localStore";

function Probe() {
  const { ready, storageError, local, retryStorage } = useApp();
  return (
    <>
      <Text testID="status">
        {JSON.stringify({ ready, storageError, local })}
      </Text>
      <Button title="Retry storage" onPress={retryStorage} />
    </>
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(200);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("failed reads never overwrite stored progress and retry restores it", async () => {
  const saved = {
    ...initialState,
    onboarded: true,
    jaapCount: 217,
    favorites: ["audio-1"],
  };
  jest
    .spyOn(localStore, "read")
    .mockRejectedValueOnce(new Error("Storage unavailable"))
    .mockResolvedValueOnce(saved);
  const screen = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await settle();
  expect(JSON.parse(screen.getByTestId("status").props.children)).toMatchObject(
    { ready: false, storageError: true },
  );
  expect(localStore.write).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Retry storage"));
  await settle();
  expect(JSON.parse(screen.getByTestId("status").props.children)).toEqual({
    ready: true,
    storageError: false,
    local: saved,
  });
  expect(localStore.write).toHaveBeenLastCalledWith(saved);
  screen.unmount();
});

test("backgrounding during hydration cannot flush empty defaults", async () => {
  let resolveRead!: (state: LocalState) => void;
  jest.spyOn(localStore, "read").mockReturnValue(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  const subscribe = jest.spyOn(AppState, "addEventListener").mockClear();
  const screen = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await settle();
  await act(async () => {
    subscribe.mock.calls.forEach(([, listener]) => listener("background"));
  });
  expect(localStore.write).not.toHaveBeenCalled();
  const saved = { ...initialState, jaapCount: 108 };
  await act(async () => {
    resolveRead(saved);
  });
  expect(subscribe).toHaveBeenCalledWith("change", expect.any(Function));
  await act(async () => {
    subscribe.mock.calls.forEach(([, listener]) => listener("background"));
  });
  expect(localStore.write).toHaveBeenLastCalledWith(saved);
  screen.unmount();
});

test("repeated corrupt-data reads stay recoverable without writing", async () => {
  jest
    .spyOn(localStore, "read")
    .mockRejectedValue(new Error("Invalid saved data"));
  const screen = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await settle();
  fireEvent.press(screen.getByText("Retry storage"));
  await settle();
  expect(localStore.read).toHaveBeenCalledTimes(2);
  expect(localStore.write).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByTestId("status").props.children)).toMatchObject(
    { ready: false, storageError: true },
  );
  screen.unmount();
});
