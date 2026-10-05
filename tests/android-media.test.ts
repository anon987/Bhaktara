import { File as FsFile } from "expo-file-system";
import { BhaktaraMediaModule } from "../modules/bhaktara-media";
import { setRuntimeMediaBaseUrl } from "../src/services/media/config";
import {
  createAndroidServices,
  deviceFileName,
} from "../src/services/platform/androidMedia";

// In-memory stand-in for the expo-file-system File/Directory API.
const mockFs = { existing: new Set<string>(), deleted: [] as string[] };
jest.mock("expo-file-system", () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === "string" ? part : part.uri))
        .join("/");
    }
    get exists() {
      return mockFs.existing.has(this.uri);
    }
    delete() {
      mockFs.deleted.push(this.uri);
      mockFs.existing.delete(this.uri);
    }
    create() {
      mockFs.existing.add(this.uri);
    }
  }
  class File extends Entry {
    static downloadFileAsync = jest.fn(
      async (
        _url: string,
        file: File,
        options: {
          onProgress?: (progress: {
            bytesWritten: number;
            totalBytes: number;
          }) => void;
        },
      ) => {
        options.onProgress?.({ bytesWritten: 50, totalBytes: 200 });
        options.onProgress?.({ bytesWritten: 51, totalBytes: 200 });
        options.onProgress?.({ bytesWritten: 200, totalBytes: 200 });
        mockFs.existing.add(file.uri);
        return file;
      },
    );
  }
  return {
    File,
    Directory: Entry,
    Paths: { cache: new Entry("file:///cache") },
  };
});

const download = FsFile.downloadFileAsync as unknown as jest.Mock;
const wallpaper = {
  contentId: "wp-1",
  title: "A golden sanctuary",
  variant: { key: "wallpaper/wp-1/full.3f9a1c2e.jpg", bytes: 200 },
};
const savedPath =
  "file:///cache/bhaktara-media/bhaktara-wp-1-full.3f9a1c2e.jpg";

function fakeNative(
  overrides: Partial<BhaktaraMediaModule> = {},
): jest.Mocked<BhaktaraMediaModule> {
  return {
    canSetWallpaper: jest.fn(() => true),
    canWriteSettings: jest.fn(() => true),
    requestWriteSettingsAsync: jest.fn(async () => true),
    saveToLibraryAsync: jest.fn(async () => "content://media/1"),
    setWallpaperAsync: jest.fn(async () => true),
    setRingtoneAsync: jest.fn(async () => "content://media/2"),
    ...overrides,
  } as jest.Mocked<BhaktaraMediaModule>;
}

beforeEach(() => {
  setRuntimeMediaBaseUrl("https://media.example.com");
  mockFs.existing.clear();
  mockFs.deleted = [];
  download.mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  setRuntimeMediaBaseUrl("");
  jest.restoreAllMocks();
});

test("device file names are stable, flat and safe", () => {
  expect(deviceFileName("wallpaper/wp-1/full.3f9a1c2e.jpg")).toBe(
    "bhaktara-wp-1-full.3f9a1c2e.jpg",
  );
  expect(deviceFileName("ringtone/om namah/file.0a1b2c3d.mp3")).toBe(
    "bhaktara-om-namah-file.0a1b2c3d.mp3",
  );
});

test("save downloads the master to the cache, reports progress, writes it and cleans up", async () => {
  const native = fakeNative();
  const services = createAndroidServices(native);
  const progress: (number | null)[] = [];
  const result = await services.mediaSave.save({
    ...wallpaper,
    kind: "image",
    onProgress: (value) => progress.push(value),
  });
  expect(result).toEqual({ status: "success" });
  expect(download).toHaveBeenCalledWith(
    "https://media.example.com/wallpaper/wp-1/full.3f9a1c2e.jpg",
    expect.objectContaining({ uri: savedPath }),
    expect.objectContaining({ idempotent: true }),
  );
  // Progress is throttled to whole percents, then null while writing.
  expect(progress).toEqual([0, 0.25, 1, null]);
  expect(native.saveToLibraryAsync).toHaveBeenCalledWith(
    savedPath,
    "image",
    "bhaktara-wp-1-full.3f9a1c2e.jpg",
    "image/jpeg",
    "A golden sanctuary",
  );
  expect(mockFs.deleted).toContain(savedPath);
});

test("wallpaper and ringtone set pass their targets; the ringtone needs system settings first", async () => {
  const native = fakeNative({ canWriteSettings: jest.fn(() => false) });
  const services = createAndroidServices(native);
  expect(services.wallpaper.canSetWallpaperDirectly).toBe(true);
  await expect(
    services.wallpaper.setWallpaper({ ...wallpaper, target: "lock" }),
  ).resolves.toEqual({ status: "success" });
  expect(native.setWallpaperAsync).toHaveBeenCalledWith(savedPath, "lock");

  const ringtone = {
    contentId: "rt-1",
    title: "Om",
    variant: { key: "ringtone/rt-1/file.0a1b2c3d.mp3" },
    target: "alarm" as const,
  };
  expect(services.ringtone.needsSystemPermission()).toBe(true);
  await expect(services.ringtone.setRingtone(ringtone)).resolves.toEqual({
    status: "permission-denied",
    permission: "system-settings",
  });
  expect(download).toHaveBeenCalledTimes(1);
  await expect(services.ringtone.requestSystemPermission()).resolves.toBe(true);
  native.canWriteSettings.mockReturnValue(true);
  await expect(services.ringtone.setRingtone(ringtone)).resolves.toEqual({
    status: "success",
  });
  expect(native.setRingtoneAsync).toHaveBeenCalledWith(
    "file:///cache/bhaktara-media/bhaktara-rt-1-file.0a1b2c3d.mp3",
    "alarm",
    "bhaktara-rt-1-file.0a1b2c3d.mp3",
    "audio/mpeg",
    "Om",
  );
});

test("native error codes map to UI states and temp files are still removed", async () => {
  const reject = (code: string) =>
    jest.fn(async () => {
      throw Object.assign(new Error(code), { code });
    });
  const cases: [string, object][] = [
    ["ERR_PERMISSION_DENIED", { permission: "storage" }],
    ["ERR_WRITE_SETTINGS_DENIED", { permission: "system-settings" }],
    ["ERR_UNSUPPORTED", { status: "unavailable" }],
    ["ERR_MEDIA_WRITE", { status: "error" }],
  ];
  for (const [code, expected] of cases) {
    mockFs.deleted = [];
    const services = createAndroidServices(
      fakeNative({ saveToLibraryAsync: reject(code) }),
    );
    const result = await services.mediaSave.save({
      ...wallpaper,
      kind: "image",
    });
    expect(result).toEqual(expect.objectContaining(expected));
    expect(mockFs.deleted).toContain(savedPath);
  }
  download.mockRejectedValueOnce(new Error("network down"));
  await expect(
    createAndroidServices(fakeNative()).mediaSave.save({
      ...wallpaper,
      kind: "image",
    }),
  ).resolves.toEqual({ status: "error" });
});

test("placeholder media, a missing CDN or a missing native module are unavailable", async () => {
  const native = fakeNative();
  const services = createAndroidServices(native);
  await expect(
    services.mediaSave.save({
      ...wallpaper,
      variant: { key: "placeholder/shiva" },
      kind: "image",
    }),
  ).resolves.toEqual({ status: "unavailable" });
  setRuntimeMediaBaseUrl("");
  await expect(
    services.mediaSave.save({ ...wallpaper, kind: "image" }),
  ).resolves.toEqual({ status: "unavailable" });
  expect(download).not.toHaveBeenCalled();

  const missing = createAndroidServices(null);
  expect(missing.mediaSave.canSave).toBe(false);
  expect(missing.wallpaper.canSetWallpaperDirectly).toBe(false);
  expect(missing.ringtone.canSetRingtone).toBe(false);
  expect(missing.share.canShare).toBe(false);
  await expect(
    missing.wallpaper.setWallpaper({ ...wallpaper, target: "home" }),
  ).resolves.toEqual({ status: "unavailable" });
});

test("status share opens the system share sheet from a cache copy without saving to the gallery", async () => {
  const native = fakeNative();
  const sharing = {
    isAvailableAsync: jest.fn(async () => true),
    shareAsync: jest.fn(async () => undefined),
  };
  const services = createAndroidServices(native, async () => sharing);
  const status = {
    contentId: "st-1",
    title: "Jai Shri Ram",
    variant: { key: "status/st-1/video720.0a1b2c3d.mp4", mime: "video/mp4" },
  };
  await expect(services.share.shareStatus(status)).resolves.toEqual({
    status: "success",
  });
  const shared =
    "file:///cache/bhaktara-share/bhaktara-st-1-video720.0a1b2c3d.mp4";
  expect(sharing.shareAsync).toHaveBeenCalledWith(shared, {
    mimeType: "video/mp4",
    dialogTitle: "Jai Shri Ram",
  });
  expect(native.saveToLibraryAsync).not.toHaveBeenCalled();
  // Kept for the receiving app; cleared before the next share.
  expect(mockFs.deleted).not.toContain(shared);
  await services.share.shareStatus(status);
  expect(mockFs.deleted).toContain("file:///cache/bhaktara-share");
  sharing.isAvailableAsync.mockResolvedValueOnce(false);
  await expect(services.share.shareStatus(status)).resolves.toEqual({
    status: "unavailable",
  });
});
