import React from "react";
import { Linking } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider } from "../src/app/providers/AppProvider";
import { DialogProvider } from "../src/components/Dialog";
import { Content } from "../src/domain/models";
import { SaveActions } from "../src/features/content/SaveActions";
import { analytics } from "../src/services/analytics";
import { setRuntimeMediaBaseUrl } from "../src/services/media/config";
import {
  MediaRequest,
  PlatformResult,
} from "../src/services/platform/contracts";
import { remoteConfig } from "../src/services/remoteConfig";
import { localStore, initialState } from "../src/services/storage/localStore";

// The platform layer is the seam: these tests drive the screen states only.
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
// Imports load before mockServices is initialised, so read it lazily.
jest.mock("../src/services/platform", () => ({
  get platformServices() {
    return mockServices;
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function renderActions(item: Content) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AppProvider>
        <DialogProvider>
          <SaveActions item={item} />
        </DialogProvider>
      </AppProvider>
    </SafeAreaProvider>,
  );
}
const base = {
  description: { en: "", hi: "" },
  deityIds: ["shiva"],
  searchTokens: [],
  saveGate: "REWARDED" as const,
  isShareable: true,
};
const wallpaper: Content = {
  ...base,
  id: "wp-1",
  type: "WALLPAPER",
  title: { en: "A golden sanctuary", hi: "स्वर्ण धाम" },
  media: {
    thumb: { key: "wallpaper/wp-1/thumb.3f9a1c2e.webp" },
    full: { key: "wallpaper/wp-1/full.3f9a1c2e.jpg" },
  },
};
const ringtone: Content = {
  ...base,
  id: "rt-1",
  type: "RINGTONE",
  title: { en: "Om", hi: "ॐ" },
  media: {
    thumb: { key: "ringtone/rt-1/thumb.0a1b2c3d.webp" },
    file: { key: "ringtone/rt-1/file.0a1b2c3d.mp3" },
  },
};
const status: Content = {
  ...base,
  id: "st-1",
  type: "STATUS",
  title: { en: "Jai Shri Ram", hi: "जय श्री राम" },
  media: {
    thumb: { key: "status/st-1/thumb.0a1b2c3d.webp" },
    video720: { key: "status/st-1/video720.0a1b2c3d.mp4" },
  },
};
const tracked = (event: string) =>
  (analytics.track as jest.Mock).mock.calls.filter(([name]) => name === event);

beforeEach(() => {
  jest
    .spyOn(localStore, "read")
    .mockResolvedValue({ ...initialState, language: "en", onboarded: true });
  jest.spyOn(localStore, "write").mockResolvedValue();
  jest.spyOn(analytics, "track").mockImplementation(() => undefined);
  setRuntimeMediaBaseUrl("https://media.example.com");
  mockServices.ringtone.needsSystemPermission.mockReturnValue(false);
  mockServices.ringtone.requestSystemPermission.mockResolvedValue(true);
});
afterEach(() => {
  setRuntimeMediaBaseUrl("");
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("placeholder art without a CDN file is shown as not available", async () => {
  const screen = renderActions({
    ...wallpaper,
    media: { thumb: { key: "placeholder/shiva" } },
  });
  await waitFor(() =>
    expect(screen.getByText(/Its file isn’t available/)).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Save to gallery"));
  expect(
    screen.getByRole("button", { name: "Save to gallery" }).props
      .accessibilityState,
  ).toEqual(expect.objectContaining({ disabled: true }));
  expect(mockServices.mediaSave.save).not.toHaveBeenCalled();
  expect(tracked("content_save_tap")).toHaveLength(0);
});

test("saving shows download progress, then success, and is free while rewarded ads are off", async () => {
  let finish: (result: PlatformResult) => void = () => undefined;
  mockServices.mediaSave.save.mockImplementation(
    (request: MediaRequest) =>
      new Promise((resolve) => {
        request.onProgress?.(0.42);
        finish = resolve;
      }),
  );
  const screen = renderActions(wallpaper);
  await waitFor(() => expect(screen.getByText("Save to gallery")).toBeTruthy());
  // Ads are off by default (Remote Config), so no ad hint is shown.
  expect(screen.queryByText(/one short ad/)).toBeNull();
  fireEvent.press(screen.getByText("Save to gallery"));
  await waitFor(() =>
    expect(screen.getByText("Downloading · 42%")).toBeTruthy(),
  );
  expect(mockServices.mediaSave.save).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "image",
      title: "A golden sanctuary",
      variant: wallpaper.media.full,
    }),
  );
  await act(async () => finish({ status: "success" }));
  expect(screen.getByText("Saved to your gallery.")).toBeTruthy();
  expect(tracked("content_save_tap")).toEqual([
    ["content_save_tap", { content_id: "wp-1", content_type: "WALLPAPER" }],
  ]);
  expect(tracked("content_save_success")).toEqual([
    [
      "content_save_success",
      { content_id: "wp-1", content_type: "WALLPAPER", via: "free" },
    ],
  ]);
});

test("set wallpaper asks for home, lock or both and reports the target", async () => {
  mockServices.wallpaper.setWallpaper.mockResolvedValue({ status: "success" });
  const screen = renderActions(wallpaper);
  await waitFor(() =>
    expect(screen.getByText("Set as wallpaper")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Set as wallpaper"));
  expect(screen.getByText("Set wallpaper on")).toBeTruthy();
  expect(screen.getByText("Home screen")).toBeTruthy();
  expect(screen.getByText("Home and lock screens")).toBeTruthy();
  fireEvent.press(screen.getByText("Lock screen"));
  await waitFor(() =>
    expect(screen.getByText("Your wallpaper is set.")).toBeTruthy(),
  );
  expect(mockServices.wallpaper.setWallpaper).toHaveBeenCalledWith(
    expect.objectContaining({ target: "lock", variant: wallpaper.media.full }),
  );
  expect(tracked("set_wallpaper")[0][1]).toEqual(
    expect.objectContaining({ target: "lock" }),
  );
});

test("set ringtone explains the system settings permission before opening it", async () => {
  mockServices.ringtone.needsSystemPermission.mockReturnValue(true);
  mockServices.ringtone.setRingtone.mockResolvedValue({ status: "success" });
  const screen = renderActions(ringtone);
  await waitFor(() => expect(screen.getByText("Set as ringtone")).toBeTruthy());
  fireEvent.press(screen.getByText("Set as ringtone"));
  fireEvent.press(screen.getByText("Phone ringtone"));
  await waitFor(() =>
    expect(screen.getByText("Allow Bhaktara to set ringtones")).toBeTruthy(),
  );
  expect(mockServices.ringtone.setRingtone).not.toHaveBeenCalled();
  mockServices.ringtone.needsSystemPermission.mockReturnValue(false);
  // The explainer walks through the three steps before leaving the app.
  expect(screen.getByText("Turn ON the switch next to Bhaktara.")).toBeTruthy();
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() =>
    expect(screen.getByText("Your new sound is set.")).toBeTruthy(),
  );
  expect(mockServices.ringtone.requestSystemPermission).toHaveBeenCalledTimes(
    1,
  );
  expect(mockServices.ringtone.setRingtone).toHaveBeenCalledWith(
    expect.objectContaining({
      target: "ringtone",
      variant: ringtone.media.file,
    }),
  );
  expect(tracked("content_save_tap")).toHaveLength(1);
  expect(tracked("set_ringtone")[0][1]).toEqual(
    expect.objectContaining({ target: "ringtone" }),
  );
});

test("a refused system settings permission leaves a path back to settings", async () => {
  mockServices.ringtone.needsSystemPermission.mockReturnValue(true);
  mockServices.ringtone.requestSystemPermission.mockResolvedValue(false);
  const screen = renderActions(ringtone);
  await waitFor(() => expect(screen.getByText("Set as ringtone")).toBeTruthy());
  fireEvent.press(screen.getByText("Set as ringtone"));
  fireEvent.press(screen.getByText("Alarm sound"));
  await waitFor(() => expect(screen.getByText("Continue")).toBeTruthy());
  fireEvent.press(screen.getByText("Continue"));
  await waitFor(() =>
    expect(screen.getByText(/Ringtone permission is off/)).toBeTruthy(),
  );
  expect(screen.getByText("Open settings")).toBeTruthy();
  expect(mockServices.ringtone.setRingtone).not.toHaveBeenCalled();
});

test("not now closes the explainer without asking for the permission", async () => {
  mockServices.ringtone.needsSystemPermission.mockReturnValue(true);
  const screen = renderActions(ringtone);
  await waitFor(() => expect(screen.getByText("Set as ringtone")).toBeTruthy());
  fireEvent.press(screen.getByText("Set as ringtone"));
  fireEvent.press(screen.getByText("Phone ringtone"));
  await waitFor(() => expect(screen.getByText("Not now")).toBeTruthy());
  fireEvent.press(screen.getByText("Not now"));
  await waitFor(() =>
    expect(screen.queryByText("Allow Bhaktara to set ringtones")).toBeNull(),
  );
  expect(mockServices.ringtone.requestSystemPermission).not.toHaveBeenCalled();
  expect(mockServices.ringtone.setRingtone).not.toHaveBeenCalled();
});

test("a storage permission denial offers settings and a retry", async () => {
  const openSettings = jest
    .spyOn(Linking, "openSettings")
    .mockResolvedValue(undefined);
  mockServices.mediaSave.save
    .mockResolvedValueOnce({
      status: "permission-denied",
      permission: "storage",
    })
    .mockResolvedValueOnce({ status: "success" });
  const screen = renderActions(ringtone);
  await waitFor(() => expect(screen.getByText("Save ringtone")).toBeTruthy());
  fireEvent.press(screen.getByText("Save ringtone"));
  await waitFor(() =>
    expect(screen.getByText(/needs permission to save files/)).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Open settings"));
  expect(openSettings).toHaveBeenCalled();
  fireEvent.press(screen.getByText("Try again"));
  await waitFor(() =>
    expect(screen.getByText("Saved to your phone’s ringtones.")).toBeTruthy(),
  );
  expect(mockServices.mediaSave.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: "audio" }),
  );
});

test("an error can be retried without passing the gate again", async () => {
  jest
    .spyOn(remoteConfig, "getBoolean")
    .mockImplementation((key) =>
      ["ads_all_enabled", "ads_rewarded_enabled"].includes(key),
    );
  mockServices.mediaSave.save
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "success" });
  const screen = renderActions(status);
  await waitFor(() => expect(screen.getByText("Save video")).toBeTruthy());
  // Rewarded ads on: the ad is disclosed before the tap (doc 11 §4).
  expect(screen.getByText(/one short ad first/)).toBeTruthy();
  fireEvent.press(screen.getByText("Save video"));
  await waitFor(() => expect(screen.getByText(/Couldn’t finish/)).toBeTruthy());
  expect(tracked("save_failed")).toHaveLength(1);
  fireEvent.press(screen.getByText("Try again"));
  await waitFor(() =>
    expect(screen.getByText("Saved to your gallery.")).toBeTruthy(),
  );
  expect(mockServices.mediaSave.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: "video", variant: status.media.video720 }),
  );
  expect(tracked("content_save_tap")).toHaveLength(1);
  // No ad SDK before M4: the no-fill fallback unlocks the save.
  expect(tracked("content_save_success")[0][1]).toEqual(
    expect.objectContaining({ via: "fallback" }),
  );
});

test("status share uses the system share sheet and is never gated", async () => {
  mockServices.share.shareStatus.mockResolvedValue({ status: "success" });
  const screen = renderActions(status);
  await waitFor(() =>
    expect(screen.getByText("Share to WhatsApp · free")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Share to WhatsApp · free"));
  await waitFor(() =>
    expect(mockServices.share.shareStatus).toHaveBeenCalledWith(
      expect.objectContaining({ variant: status.media.video720 }),
    ),
  );
  await waitFor(() => expect(tracked("content_share")).toHaveLength(1));
  expect(tracked("content_save_tap")).toHaveLength(0);
});

test("unsupported devices see a clear message after the attempt", async () => {
  mockServices.wallpaper.setWallpaper.mockResolvedValue({
    status: "unavailable",
  });
  const screen = renderActions(wallpaper);
  await waitFor(() =>
    expect(screen.getByText("Set as wallpaper")).toBeTruthy(),
  );
  fireEvent.press(screen.getByText("Set as wallpaper"));
  fireEvent.press(screen.getByText("Home screen"));
  await waitFor(() =>
    expect(
      screen.getByText("This isn’t supported on your phone."),
    ).toBeTruthy(),
  );
});
