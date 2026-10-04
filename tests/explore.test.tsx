import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { ExploreScreen } from "../src/features/explore/ExploreScreen";
import { Backend } from "../src/services/backend";
import { fixtures } from "../src/repositories/fixtures";
import { mockContentRepository } from "../src/repositories/mockRepository";
import { ContentRepository } from "../src/repositories/contracts";
import { localStore, initialState } from "../src/services/storage/localStore";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const navigation = { navigate: jest.fn(), setParams: jest.fn() };
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en", onboarded: true });
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});
function renderExplore(search: ContentRepository["search"]) {
  const backend: Backend = {
    mode: "emulator",
    session: {
      ensureSession: async () => ({ uid: "guest", isAnonymous: true }),
    },
    content: { ...mockContentRepository, search },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend}>
        <ExploreScreen
          navigation={navigation as never}
          route={{ key: "Explore", name: "Explore" } as never}
        />
      </AppProvider>
    </SafeAreaProvider>,
  );
}
const chalisa = fixtures.content.find((item) => item.id === "chalisa-1")!;

test("filtered server pages that come back empty are skipped, not reported as no results", async () => {
  const search = jest.fn<
    ReturnType<ContentRepository["search"]>,
    Parameters<ContentRepository["search"]>
  >(async ({ cursor }) =>
    cursor === "page-2"
      ? { items: [chalisa] }
      : { items: [], nextCursor: "page-2" },
  );
  const screen = renderExplore(search);
  await waitFor(() => expect(screen.getByText("Hanuman Chalisa")).toBeTruthy());
  expect(screen.queryByText("No content found")).toBeNull();
  expect(search).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: "page-2" }),
  );
});

test("load more is withdrawn as soon as filters change", async () => {
  const search = jest.fn<
    ReturnType<ContentRepository["search"]>,
    Parameters<ContentRepository["search"]>
  >(async () => ({ items: [chalisa], nextCursor: "next" }));
  const screen = renderExplore(search);
  await waitFor(() => expect(screen.getByText("Load more")).toBeTruthy());
  fireEvent.changeText(
    screen.getByLabelText("Search bhajans, deities & more"),
    "shiva",
  );
  // Before the debounced search runs, the old cursor must not be usable.
  expect(screen.queryByText("Load more")).toBeNull();
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "shiva" }),
    ),
  );
  expect(search).not.toHaveBeenCalledWith(
    expect.objectContaining({ query: "shiva", cursor: "next" }),
  );
});
