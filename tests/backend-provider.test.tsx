import React from "react";
import { Button, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { Backend } from "../src/services/backend";
import { fixtures } from "../src/repositories/fixtures";
import { mockContentRepository } from "../src/repositories/mockRepository";

function Probe() {
  const { connection, catalog, retry } = useApp();
  return (
    <>
      <Text testID="backend">{connection}</Text>
      <Text testID="count">{catalog?.content.length ?? 0}</Text>
      <Button title="Retry backend" onPress={retry} />
    </>
  );
}
test("backend errors do not silently load fixtures and can recover", async () => {
  const ensureSession = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ uid: "guest", isAnonymous: true });
  const getCatalog = jest.fn(async () => fixtures);
  const backend: Backend = {
    mode: "emulator",
    session: { ensureSession },
    content: { ...mockContentRepository, getCatalog },
  };
  const loadBackend = async () => backend;
  const screen = render(
    <AppProvider loadBackend={loadBackend}>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("backend").props.children).toBe("error"),
  );
  expect(getCatalog).not.toHaveBeenCalled();
  expect(screen.getByTestId("count").props.children).toBe(0);
  fireEvent.press(screen.getByText("Retry backend"));
  await waitFor(() =>
    expect(screen.getByTestId("backend").props.children).toBe("emulator"),
  );
  expect(getCatalog).toHaveBeenCalledTimes(1);
});
test("late responses from an earlier catalog retry cannot overwrite the latest result", async () => {
  let resolveOld!: (value: typeof fixtures) => void;
  const getCatalog = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue({ ...fixtures, content: [] });
  const backend: Backend = {
    mode: "emulator",
    session: {
      ensureSession: async () => ({ uid: "guest", isAnonymous: true }),
    },
    content: { ...mockContentRepository, getCatalog },
  };
  const loadBackend = async () => backend;
  const screen = render(
    <AppProvider loadBackend={loadBackend}>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => expect(getCatalog).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByText("Retry backend"));
  await waitFor(() =>
    expect(screen.getByTestId("backend").props.children).toBe("emulator"),
  );
  await act(async () => {
    resolveOld(fixtures);
  });
  expect(screen.getByTestId("count").props.children).toBe(0);
});
