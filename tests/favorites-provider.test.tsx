import React from "react";
import { Button, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { FavoriteList } from "../src/features/profile/FavoriteList";
import { Backend } from "../src/services/backend";
import { mockContentRepository } from "../src/repositories/mockRepository";
import { deviceFavoritesRepository } from "../src/repositories/favoritesRepository";
import { FavoritesRepository } from "../src/repositories/contracts";
import { codedError } from "../src/repositories/firestoreErrors";
import { initialState, localStore } from "../src/services/storage/localStore";
import {
  FavoritesSyncState,
  FavoritesSyncStore,
  initialFavoritesSyncState,
} from "../src/services/favorites/syncStore";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function Probe() {
  const { local, favoritesStatus, toggleFavorite, catalog } = useApp();
  return (
    <>
      <Text testID="favorites">{JSON.stringify(local.favorites)}</Text>
      <Text testID="status">{JSON.stringify(favoritesStatus)}</Text>
      <Text testID="catalog">{catalog ? "ready" : "loading"}</Text>
      <Button
        title="Toggle bhajan"
        onPress={() => toggleFavorite("bhajan-1")}
      />
      <Button title="Toggle aarti" onPress={() => toggleFavorite("aarti-1")} />
      <FavoriteList onSelect={() => undefined} />
    </>
  );
}

function memoryStore() {
  const store: FavoritesSyncStore & {
    saved: FavoritesSyncState;
    read: jest.Mock;
    write: jest.Mock;
  } = {
    saved: initialFavoritesSyncState,
    read: jest.fn(async () => store.saved),
    write: jest.fn(async (state: FavoritesSyncState) => {
      store.saved = state;
    }),
  };
  return store;
}

function renderApp(backend: Backend, store: FavoritesSyncStore) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend} favoritesStore={store}>
        <Probe />
      </AppProvider>
    </SafeAreaProvider>,
  );
}
const read = (screen: ReturnType<typeof renderApp>, id: string) =>
  JSON.parse(screen.getByTestId(id).props.children);

// The first render loads the whole provider tree, slow on a cold cache.
jest.setTimeout(30_000);
beforeEach(() => {
  jest.spyOn(localStore, "write").mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("fixture mode keeps favorites on the device only, in add order", async () => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  const store = memoryStore();
  const screen = renderApp(
    {
      mode: "fixture",
      session: { ensureSession: async () => null },
      content: mockContentRepository,
      favorites: deviceFavoritesRepository,
    },
    store,
  );
  await waitFor(() =>
    expect(screen.getByTestId("catalog").props.children).toBe("ready"),
  );
  fireEvent.press(screen.getByText("Toggle aarti"));
  fireEvent.press(screen.getByText("Toggle bhajan"));
  expect(read(screen, "favorites")).toEqual(["aarti-1", "bhajan-1"]);
  expect(read(screen, "status")).toEqual({
    source: "device",
    pending: 0,
    waiting: false,
  });
  await waitFor(() => expect(screen.getByText("Shiva aarti")).toBeTruthy());
  expect(screen.getByText("A morning with Krishna")).toBeTruthy();
  fireEvent.press(screen.getByText("Toggle aarti"));
  expect(read(screen, "favorites")).toEqual(["bhajan-1"]);
  expect(store.read).not.toHaveBeenCalled();
  expect(store.write).not.toHaveBeenCalled();
});

function account(initial: string[] = []) {
  const docs = [...initial];
  const repository: FavoritesRepository = {
    kind: "account",
    add: jest.fn(async (id: string) => {
      if (!docs.includes(id)) docs.unshift(id);
    }),
    remove: jest.fn(async (id: string) => {
      const index = docs.indexOf(id);
      if (index >= 0) docs.splice(index, 1);
    }),
    list: jest.fn(async () => ({
      items: docs.map((contentId) => ({
        contentId,
        type: "BHAJAN" as const,
        createdAtMs: 0,
      })),
    })),
  };
  return { docs, repository };
}
const emulatorBackend = (favorites: FavoritesRepository): Backend => ({
  mode: "emulator",
  session: {
    ensureSession: async () => ({ uid: "guest", isAnonymous: true }),
  },
  content: mockContentRepository,
  favorites,
});

test("a session migrates device favorites, then toggles update optimistically", async () => {
  jest.spyOn(localStore, "read").mockResolvedValue({
    ...initialState,
    language: "en",
    favorites: ["chalisa-1"],
  });
  const store = memoryStore();
  const { docs, repository } = account(["aarti-1"]);
  const screen = renderApp(emulatorBackend(repository), store);
  // The device favorite joins the account list once; the cache mirrors it.
  await waitFor(() =>
    expect(read(screen, "favorites")).toEqual(["chalisa-1", "aarti-1"]),
  );
  expect(repository.add).toHaveBeenCalledWith("chalisa-1", undefined);
  expect(store.saved.migrated).toEqual(["guest"]);
  expect(read(screen, "status")).toMatchObject({ source: "account" });
  await waitFor(() => expect(screen.getByText("Hanuman Chalisa")).toBeTruthy());
  expect(screen.getByText("Shiva aarti")).toBeTruthy();

  let release!: () => void;
  jest.mocked(repository.add).mockImplementationOnce(
    (id) =>
      new Promise<void>((resolve) => {
        release = () => {
          docs.unshift(id);
          resolve();
        };
      }),
  );
  fireEvent.press(screen.getByText("Toggle bhajan"));
  // Shown at once, newest first, while the write is still in flight.
  expect(read(screen, "favorites")).toEqual([
    "bhajan-1",
    "chalisa-1",
    "aarti-1",
  ]);
  await waitFor(() =>
    expect(store.saved.queue).toMatchObject([
      { contentId: "bhajan-1", op: "add", type: "BHAJAN" },
    ]),
  );
  expect(read(screen, "status")).toMatchObject({ pending: 1, waiting: false });
  await act(async () => release());
  await waitFor(() => expect(store.saved.queue).toEqual([]));
  expect(docs).toEqual(["bhajan-1", "chalisa-1", "aarti-1"]);
  expect(read(screen, "status")).toMatchObject({ pending: 0 });

  fireEvent.press(screen.getByText("Toggle aarti"));
  expect(read(screen, "favorites")).toEqual(["bhajan-1", "chalisa-1"]);
  await waitFor(() => expect(docs).toEqual(["bhajan-1", "chalisa-1"]));
  expect(repository.add).toHaveBeenCalledTimes(2);
});

test("offline toggles stay on the device and say they will sync", async () => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en" });
  const store = memoryStore();
  store.saved = { ...initialFavoritesSyncState, migrated: ["guest"] };
  const { repository } = account();
  jest
    .mocked(repository.add)
    .mockRejectedValue(codedError("unavailable", "offline"));
  const screen = renderApp(emulatorBackend(repository), store);
  await waitFor(() =>
    expect(read(screen, "status")).toMatchObject({ source: "account" }),
  );
  fireEvent.press(screen.getByText("Toggle bhajan"));
  await waitFor(() =>
    expect(
      screen.getByText(
        "Saved on this device. Your favorites will update in your account when you are back online.",
      ),
    ).toBeTruthy(),
  );
  expect(read(screen, "favorites")).toEqual(["bhajan-1"]);
  expect(read(screen, "status")).toEqual({
    source: "account",
    pending: 1,
    waiting: true,
  });
  expect(store.saved.queue).toMatchObject([
    { contentId: "bhajan-1", op: "add", attempts: 1 },
  ]);
  screen.unmount();
});
