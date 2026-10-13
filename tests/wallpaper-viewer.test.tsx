import React from "react";
import { FlatList } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Catalog, Content } from "../src/domain/models";
import { deityWallpapers } from "../src/domain/wallpaperFeed";
import { WallpaperViewer } from "../src/features/content/WallpaperViewer";
import { Backend } from "../src/services/backend";
import { analytics } from "../src/services/analytics";
import { setRuntimeMediaBaseUrl } from "../src/services/media/config";
import { localStore, initialState } from "../src/services/storage/localStore";

// The platform layer is the seam: these tests drive the viewer only.
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
    shareToApp: jest.fn(),
    installedWhatsApps: jest.fn((): ("whatsapp" | "business")[] => []),
  },
  notifications: { canRequest: false, request: jest.fn() },
};
jest.mock("../src/services/platform", () => ({
  get platformServices() {
    return mockServices;
  },
}));

const wallpaper = (id: string, deity: string, title: string): Content => ({
  id,
  type: "WALLPAPER",
  title: { en: title, hi: title },
  description: { en: "", hi: "" },
  deityIds: [deity],
  searchTokens: [],
  saveGate: "REWARDED",
  isShareable: true,
  media: {
    thumb: { key: `wallpaper/${id}/thumb.3f9a1c2e.webp` },
    mobile: { key: `wallpaper/${id}/mobile.3f9a1c2e.webp` },
    full: { key: `wallpaper/${id}/full.3f9a1c2e.jpg` },
  },
});
const shiva1 = wallpaper("wp-shiva-1", "shiva", "Kailash dawn");
const ganesha = wallpaper("wp-ganesha", "ganesha", "Lotus light");
const shiva2 = wallpaper("wp-shiva-2", "shiva", "Nandi at rest");
const shiva3 = wallpaper("wp-shiva-3", "shiva", "Moonlit Shiva");
const shivaBhajan: Content = {
  ...shiva1,
  id: "bhajan-shiva",
  type: "BHAJAN",
  title: { en: "Shiva bhajan", hi: "शिव भजन" },
};
const content = [shiva1, ganesha, shivaBhajan, shiva2, shiva3];

function backend(items: Content[]): Backend {
  const catalog: Catalog = {
    content: items,
    deities: [],
    banners: [],
    challenges: [],
    sampleStats: { totalXp: 0, level: 1, currentStreak: 0 },
  };
  return {
    mode: "fixture",
    content: {
      getCatalog: async () => catalog,
      getById: async (id) => items.find((item) => item.id === id) ?? null,
      search: async () => ({ items: [] }),
      getHome: async () => null,
    },
    session: { ensureSession: async () => null },
  };
}
// Opens the viewer once the catalog has loaded, like ContentScreen does.
function Opened({ id, onBack }: { id: string; onBack: () => void }) {
  const { catalog, ready } = useApp();
  const item = catalog?.content.find((value) => value.id === id);
  if (!item || !ready) return null;
  return <WallpaperViewer item={item} source="explore" onBack={onBack} />;
}
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};
async function open(id: string, items = content) {
  const onBack = jest.fn();
  const screen = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider loadBackend={async () => backend(items)}>
        <DialogProvider>
          <Opened id={id} onBack={onBack} />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("wallpaper-pages")).toBeTruthy(),
  );
  return { screen, onBack };
}
const pageIds = (screen: ReturnType<typeof render>) =>
  (screen.UNSAFE_getByType(FlatList).props.data as Content[]).map(
    (item) => item.id,
  );
const tracked = (event: string) =>
  (analytics.track as jest.Mock).mock.calls.filter(([name]) => name === event);
// The labels of every button, top to bottom.
const buttons = (screen: ReturnType<typeof render>) =>
  screen
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as string);

let stored = { ...initialState, language: "en" as const, onboarded: true };
beforeEach(() => {
  stored = { ...initialState, language: "en", onboarded: true };
  jest.spyOn(localStore, "read").mockImplementation(async () => stored);
  jest.spyOn(localStore, "write").mockResolvedValue();
  jest.spyOn(analytics, "track").mockImplementation(() => undefined);
  setRuntimeMediaBaseUrl("https://media.example.com");
  mockServices.wallpaper.canSetWallpaperDirectly = true;
  mockServices.share.canShare = true;
});
afterEach(() => {
  setRuntimeMediaBaseUrl("");
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("the deity's wallpapers start at the opened one, in catalog order, wrapping round", () => {
  expect(deityWallpapers(content, shiva2).map((item) => item.id)).toEqual([
    "wp-shiva-2",
    "wp-shiva-3",
    "wp-shiva-1",
  ]);
  expect(deityWallpapers(content, ganesha)).toEqual([ganesha]);
  expect(deityWallpapers(content, { ...shiva1, deityIds: [] })).toHaveLength(1);
});

test("the viewer pages through the deity's wallpapers from the tapped one", async () => {
  const { screen } = await open("wp-shiva-2");
  expect(pageIds(screen)).toEqual(["wp-shiva-2", "wp-shiva-3", "wp-shiva-1"]);
  // Only the image: no name or count on screen.
  expect(screen.queryByText("Nandi at rest")).toBeNull();
  expect(screen.queryByText(/Wallpaper \d+ \//)).toBeNull();
  expect(tracked("content_view")).toEqual([
    [
      "content_view",
      {
        content_id: "wp-shiva-2",
        content_type: "WALLPAPER",
        source: "explore",
      },
    ],
  ]);
  // Swipe up one page; the view is tracked once the page settles.
  const list = screen.UNSAFE_getByType(FlatList);
  const next = list.props.getItemLayout(null, 1).offset;
  fireEvent(screen.getByTestId("wallpaper-pages"), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: 0, y: next } },
  });
  await waitFor(() => expect(tracked("content_view")).toHaveLength(2));
  expect(tracked("content_view")[1][1]).toEqual(
    expect.objectContaining({ content_id: "wp-shiva-3" }),
  );
});

test("WhatsApp sits above Set wallpaper at the bottom right; the top bar has only back", async () => {
  const { screen, onBack } = await open("wp-shiva-1");
  const labels = buttons(screen);
  const whatsapp = labels.indexOf("Send on WhatsApp");
  const set = labels.indexOf("Set as wallpaper");
  expect(whatsapp).toBeGreaterThanOrEqual(0);
  expect(set).toBeGreaterThan(whatsapp);
  expect(labels).toContain("Close");
  expect(labels).not.toContain("Save to gallery");
  expect(labels).not.toContain("Add to favorites");
  fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(onBack).toHaveBeenCalled();
});

test("Set wallpaper is hidden when the phone cannot set it directly", async () => {
  mockServices.wallpaper.canSetWallpaperDirectly = false;
  const { screen } = await open("wp-shiva-1");
  expect(screen.getByText("Send on WhatsApp")).toBeTruthy();
  expect(screen.queryByText("Set as wallpaper")).toBeNull();
});

test("WhatsApp share sends the large file with the caption and is never gated", async () => {
  mockServices.share.shareToWhatsApp.mockResolvedValue({
    status: "success",
    channel: "whatsapp",
  });
  const { screen } = await open("wp-shiva-1");
  fireEvent.press(screen.getByText("Send on WhatsApp"));
  await waitFor(() => expect(tracked("content_share")).toHaveLength(1));
  // No app chosen: only one (or no known) WhatsApp app is installed.
  expect(mockServices.share.shareToWhatsApp).toHaveBeenCalledWith(
    expect.objectContaining({
      variant: shiva1.media.full,
      text: "A divine wallpaper for you, from the Bhaktara app.",
    }),
    undefined,
  );
  expect(tracked("content_share")[0][1]).toEqual({
    content_id: "wp-shiva-1",
    content_type: "WALLPAPER",
    channel: "whatsapp",
  });
  expect(tracked("content_save_tap")).toHaveLength(0);
});

test("with both WhatsApp apps installed, WhatsApp asks which one to use", async () => {
  mockServices.share.installedWhatsApps.mockReturnValueOnce([
    "whatsapp",
    "business",
  ]);
  mockServices.share.shareToWhatsApp.mockResolvedValue({
    status: "success",
    channel: "whatsapp",
  });
  const { screen } = await open("wp-shiva-1");
  fireEvent.press(screen.getByText("Send on WhatsApp"));
  expect(screen.getByText("Send with")).toBeTruthy();
  fireEvent.press(screen.getByText("WhatsApp Business"));
  await waitFor(() =>
    expect(mockServices.share.shareToWhatsApp).toHaveBeenCalled(),
  );
  expect(mockServices.share.shareToWhatsApp.mock.calls[0][1]).toBe("business");
});

test("with only one WhatsApp app, sharing goes straight to it", async () => {
  mockServices.share.installedWhatsApps.mockReturnValueOnce(["business"]);
  mockServices.share.shareToWhatsApp.mockResolvedValue({
    status: "success",
    channel: "whatsapp",
  });
  const { screen } = await open("wp-shiva-1");
  fireEvent.press(screen.getByText("Send on WhatsApp"));
  await waitFor(() =>
    expect(mockServices.share.shareToWhatsApp).toHaveBeenCalled(),
  );
  expect(screen.queryByText("Send with")).toBeNull();
  expect(mockServices.share.shareToWhatsApp.mock.calls[0][1]).toBe("business");
});

test("Set wallpaper keeps the home / lock / both chooser and reports progress in a toast", async () => {
  let finish: (value: { status: "success" }) => void = () => undefined;
  mockServices.wallpaper.setWallpaper.mockImplementation(
    (request: { onProgress?: (value: number) => void }) =>
      new Promise((resolve) => {
        request.onProgress?.(0.5);
        finish = resolve;
      }),
  );
  const { screen } = await open("wp-shiva-1");
  fireEvent.press(screen.getByText("Set as wallpaper"));
  expect(screen.getByText("Set wallpaper on")).toBeTruthy();
  fireEvent.press(screen.getByText("Home and lock screens"));
  await waitFor(() =>
    expect(screen.getByText("Downloading · 50%")).toBeTruthy(),
  );
  // No paging away while the download runs.
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(false);
  await act(async () => finish({ status: "success" }));
  expect(screen.getByText("Your wallpaper is set.")).toBeTruthy();
  expect(mockServices.wallpaper.setWallpaper).toHaveBeenCalledWith(
    expect.objectContaining({ target: "both", variant: shiva1.media.full }),
  );
  expect(tracked("set_wallpaper")[0][1]).toEqual(
    expect.objectContaining({ target: "both" }),
  );
});

test("a failed set-wallpaper shows a retry in the toast", async () => {
  mockServices.wallpaper.setWallpaper
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "success" });
  const { screen } = await open("wp-shiva-1");
  fireEvent.press(screen.getByText("Set as wallpaper"));
  fireEvent.press(screen.getByText("Home and lock screens"));
  await waitFor(() => expect(screen.getByText(/Couldn’t finish/)).toBeTruthy());
  fireEvent.press(screen.getByText("Try again"));
  await waitFor(() =>
    expect(screen.getByText("Your wallpaper is set.")).toBeTruthy(),
  );
  expect(mockServices.wallpaper.setWallpaper).toHaveBeenLastCalledWith(
    expect.objectContaining({ target: "both", variant: shiva1.media.full }),
  );
});

test("the swipe-up hint shows once and is remembered", async () => {
  const { screen } = await open("wp-shiva-1");
  expect(screen.getByText("Swipe up for more")).toBeTruthy();
  fireEvent.press(screen.getByText("Swipe up for more"));
  await waitFor(() =>
    expect(screen.queryByText("Swipe up for more")).toBeNull(),
  );
  await waitFor(() =>
    expect(localStore.write).toHaveBeenCalledWith(
      expect.objectContaining({ seenHints: ["wallpaperSwipe"] }),
    ),
  );
  screen.unmount();
  stored = { ...stored, seenHints: ["wallpaperSwipe"] };
  const again = await open("wp-shiva-1");
  expect(again.screen.queryByText("Swipe up for more")).toBeNull();
});

test("a deity with one wallpaper is a single page without the hint", async () => {
  const { screen } = await open("wp-ganesha");
  expect(pageIds(screen)).toEqual(["wp-ganesha"]);
  expect(screen.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(false);
  expect(screen.queryByText("Swipe up for more")).toBeNull();
  expect(screen.queryByText(/Wallpaper 1 \//)).toBeNull();
});
