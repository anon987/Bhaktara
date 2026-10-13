import React from "react";
import { FlatList, TextInput } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Catalog, Content, ContentType } from "../src/domain/models";
import { DeityContentScreen } from "../src/features/explore/DeityContentScreen";
import { ExploreScreen } from "../src/features/explore/ExploreScreen";
import { Backend } from "../src/services/backend";
import { analytics } from "../src/services/analytics";
import { fixtures } from "../src/repositories/fixtures";
import {
  filterContent,
  mockContentRepository,
} from "../src/repositories/mockRepository";
import { ContentRepository } from "../src/repositories/contracts";
import { localStore, initialState } from "../src/services/storage/localStore";

// The platform layer is the seam for the viewers' Save / Set / Share.
const mockServices = {
  wallpaper: { canSetWallpaperDirectly: true, setWallpaper: jest.fn() },
  ringtone: {
    canSetRingtone: true,
    needsSystemPermission: jest.fn(() => false),
    requestSystemPermission: jest.fn(async () => true),
    setRingtone: jest.fn(),
  },
  mediaSave: { canSave: true, save: jest.fn() },
  share: {
    canShare: true,
    shareStatus: jest.fn(),
    shareToWhatsApp: jest.fn(),
  },
  notifications: { canRequest: false, request: jest.fn() },
};
jest.mock("../src/services/platform", () => ({
  get platformServices() {
    return mockServices;
  },
}));
const mockPlayer = { load: jest.fn() };
jest.mock("../src/features/player/PlayerProvider", () => ({
  usePlayer: () => mockPlayer,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const navigation = {
  navigate: jest.fn(),
  setParams: jest.fn(),
  goBack: jest.fn(),
};
beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en", onboarded: true });
  jest.spyOn(localStore, "write").mockResolvedValue();
  jest.spyOn(analytics, "track").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

function backendWith(
  content: Partial<ContentRepository> = {},
  catalog?: Partial<Catalog>,
): Backend {
  return {
    mode: "fixture",
    session: { ensureSession: async () => null },
    content: {
      ...mockContentRepository,
      ...(catalog
        ? { getCatalog: async () => ({ ...fixtures, ...catalog }) }
        : {}),
      ...content,
    },
  };
}
function Providers({
  backend,
  children,
}: React.PropsWithChildren<{ backend: Backend }>) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend}>
        <DialogProvider>{children}</DialogProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
const exploreRoute = (category?: string) =>
  ({
    key: "Explore",
    name: "Explore",
    params: category ? { category } : undefined,
  }) as never;
function renderExplore(backend = backendWith(), category?: string) {
  const screen = render(
    <Providers backend={backend}>
      <ExploreScreen
        navigation={navigation as never}
        route={exploreRoute(category)}
      />
    </Providers>,
  );
  return {
    ...screen,
    showCategory: (next: string) =>
      screen.rerender(
        <Providers backend={backend}>
          <ExploreScreen
            navigation={navigation as never}
            route={exploreRoute(next)}
          />
        </Providers>,
      ),
  };
}
function renderDeity(
  deityId: string,
  type: ContentType,
  backend = backendWith(),
) {
  return render(
    <Providers backend={backend}>
      <DeityContentScreen
        navigation={navigation as never}
        route={
          {
            key: "DeityContent",
            name: "DeityContent",
            params: { deityId, type, source: "explore" },
          } as never
        }
      />
    </Providers>,
  );
}
const shownDeities = (screen: ReturnType<typeof render>) =>
  screen
    .queryAllByTestId(/^deity-(?!image-)/)
    .map((node) => String(node.props.testID).replace("deity-", ""));
const tracked = (event: string) =>
  (analytics.track as jest.Mock).mock.calls.filter(([name]) => name === event);

test("Explore has no search box, no item list and no favourite buttons", async () => {
  const screen = renderExplore();
  await waitFor(() => expect(screen.getByText("Choose a god")).toBeTruthy());
  expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  expect(screen.queryByLabelText("Search bhajans, deities & more")).toBeNull();
  expect(screen.queryByLabelText("Add to favorites")).toBeNull();
  // Content names are file names and never shown here.
  expect(screen.queryByText("A golden sanctuary")).toBeNull();
  expect(screen.queryByText("Lotus light")).toBeNull();
});

test("Wallpapers is the default and only gods with wallpapers are shown, each with image and name", async () => {
  const screen = renderExplore();
  await waitFor(() => expect(shownDeities(screen)).toHaveLength(2));
  expect(
    screen.getByTestId("category-WALLPAPER").props.accessibilityState,
  ).toEqual({ selected: true });
  expect(
    screen.getByTestId("category-BHAJAN").props.accessibilityState,
  ).toEqual({ selected: false });
  // Catalog order (deity sortOrder), only those with a published wallpaper.
  expect(shownDeities(screen)).toEqual(["ganesha", "durga"]);
  for (const [id, name] of [
    ["ganesha", "Ganesha"],
    ["durga", "Durga"],
  ]) {
    expect(screen.getByTestId(`deity-image-${id}`)).toBeTruthy();
    expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByText(name)).toBeTruthy();
  }
  expect(screen.queryByText("Shiva")).toBeNull();
});

test("category tiles select the category, honouring route.params.category", async () => {
  const screen = renderExplore(backendWith(), "BHAJAN");
  await waitFor(() =>
    expect(shownDeities(screen)).toEqual(["krishna", "hanuman"]),
  );
  expect(
    screen.getByTestId("category-BHAJAN").props.accessibilityState,
  ).toEqual({ selected: true });
  // Every category has a big labelled tile.
  for (const label of [
    "Wallpapers",
    "Bhajan",
    "Aarti",
    "Mantra",
    "Chalisa",
    "Ringtones",
    "Status",
  ])
    expect(screen.getByLabelText(label)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Aarti"));
  expect(navigation.setParams).toHaveBeenLastCalledWith({ category: "AARTI" });
  screen.showCategory("AARTI");
  await waitFor(() => expect(shownDeities(screen)).toHaveLength(5));
  screen.showCategory("CHALISA");
  await waitFor(() => expect(shownDeities(screen)).toEqual(["hanuman"]));
});

test("gods missing from the catalog are checked with one small type + deity query each, cached per category", async () => {
  // The cloud catalog holds only a few items: here none at all.
  const search = jest.fn<
    ReturnType<ContentRepository["search"]>,
    Parameters<ContentRepository["search"]>
  >(async (query) => ({ items: filterContent(query).slice(0, query.limit) }));
  const backend = backendWith({ search }, { content: [] });
  const screen = renderExplore(backend);
  await waitFor(() =>
    expect(shownDeities(screen)).toEqual(["ganesha", "durga"]),
  );
  expect(search).toHaveBeenCalledTimes(fixtures.deities.length);
  for (const deity of fixtures.deities)
    expect(search).toHaveBeenCalledWith({
      type: "WALLPAPER",
      deityId: deity.id,
      limit: 1,
    });
  screen.showCategory("STATUS");
  await waitFor(() => expect(shownDeities(screen)).toEqual(["krishna"]));
  const asked = search.mock.calls.length;
  // Back to Wallpapers: answered from the cache, no new requests.
  screen.showCategory("WALLPAPER");
  await waitFor(() =>
    expect(shownDeities(screen)).toEqual(["ganesha", "durga"]),
  );
  expect(search).toHaveBeenCalledTimes(asked);
});

test("a category with no content shows a friendly empty state", async () => {
  const backend = backendWith(
    { search: async () => ({ items: [] }) },
    { content: [] },
  );
  const screen = renderExplore(backend, "RINGTONE");
  await waitFor(() =>
    expect(
      screen.getByText("Nothing here yet. Please choose another one above."),
    ).toBeTruthy(),
  );
  expect(shownDeities(screen)).toEqual([]);
});

test("tapping a god on Wallpapers opens the full-screen viewer on that god's wallpapers, from the first", async () => {
  const screen = renderExplore();
  await waitFor(() => expect(screen.getByLabelText("Durga")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Durga"));
  expect(navigation.navigate).toHaveBeenLastCalledWith("DeityContent", {
    deityId: "durga",
    type: "WALLPAPER",
    source: "explore",
  });

  const durga = (id: string): Content => ({
    ...fixtures.content.find((item) => item.id === "wallpaper-1")!,
    id,
  });
  const wallpapers = [durga("wp-durga-a"), durga("wp-durga-b")];
  const viewer = renderDeity(
    "durga",
    "WALLPAPER",
    backendWith(
      {
        search: async (query) => ({
          items:
            query.type === "WALLPAPER" && query.deityId === "durga"
              ? wallpapers
              : [],
        }),
      },
      { content: [...fixtures.content, ...wallpapers] },
    ),
  );
  await waitFor(() =>
    expect(viewer.getByTestId("wallpaper-pages")).toBeTruthy(),
  );
  const pages = viewer.UNSAFE_getByType(FlatList).props.data as Content[];
  expect(pages.map((item) => item.id)).toEqual(["wp-durga-a", "wp-durga-b"]);
  expect(tracked("content_view")[0][1]).toEqual({
    content_id: "wp-durga-a",
    content_type: "WALLPAPER",
    source: "explore",
  });
  expect(viewer.getByText("Send on WhatsApp")).toBeTruthy();
});

test("Bhajan: the god's page lists their bhajans with a play button that uses the player", async () => {
  const screen = renderDeity("krishna", "BHAJAN");
  await waitFor(() =>
    expect(screen.getByText("A morning with Krishna")).toBeTruthy(),
  );
  // Header: the god's round picture and name.
  expect(screen.getByTestId("deity-image-krishna")).toBeTruthy();
  expect(screen.getByText("Krishna")).toBeTruthy();
  // Only that god's bhajans; no favourites.
  expect(screen.queryByText("Evening devotion")).toBeNull();
  expect(screen.queryByLabelText("Add to favorites")).toBeNull();
  fireEvent.press(screen.getByLabelText("Play · A morning with Krishna"));
  expect(mockPlayer.load).toHaveBeenCalledWith(
    expect.objectContaining({ id: "bhajan-1" }),
    "explore",
  );
  expect(navigation.navigate).toHaveBeenLastCalledWith("Player");
  expect(tracked("content_view")).toEqual([
    [
      "content_view",
      { content_id: "bhajan-1", content_type: "BHAJAN", source: "explore" },
    ],
  ]);
});

test("Ringtone rows keep Set as ringtone", async () => {
  const screen = renderDeity("shiva", "RINGTONE");
  await waitFor(() => expect(screen.getByText("Temple bells")).toBeTruthy());
  expect(screen.getByLabelText(/Set as ringtone/)).toBeTruthy();
});

test("Status: the god's videos open full screen, poster first, with WhatsApp above Save", async () => {
  const screen = renderDeity("krishna", "STATUS");
  await waitFor(() => expect(screen.getByTestId("status-pages")).toBeTruthy());
  const pages = screen.UNSAFE_getByType(FlatList).props.data as Content[];
  expect(pages.map((item) => item.id)).toEqual(["status-1"]);
  // No titles or counts on screen.
  expect(screen.queryByText("A moment of bhakti")).toBeNull();
  const labels = screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as string);
  const whatsapp = labels.indexOf("Send on WhatsApp");
  expect(whatsapp).toBeGreaterThanOrEqual(0);
  expect(labels.indexOf("Save video")).toBeGreaterThan(whatsapp);
  expect(tracked("content_view")[0][1]).toEqual({
    content_id: "status-1",
    content_type: "STATUS",
    source: "explore",
  });
});
