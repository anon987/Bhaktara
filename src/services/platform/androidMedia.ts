import { Directory, File, Paths } from "expo-file-system";
import {
  BhaktaraMedia,
  BhaktaraMediaModule,
} from "../../../modules/bhaktara-media";
import { resolveMediaUrl } from "../media/config";
import { MediaRequest, PlatformResult, PlatformServices } from "./contracts";
import { stubServices } from "./stub";

// Downloads land in the app cache first (doc 22 §A5: `full`, `file` and
// `video720` load only on an explicit save), then the native module writes
// them to MediaStore / WallpaperManager / RingtoneManager.
const SAVE_FOLDER = "bhaktara-media";
// Share copies stay until the next share: the receiving app may read the file
// after the share sheet closes.
const SHARE_FOLDER = "bhaktara-share";

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
};

// Content-addressed keys ({type}/{id}/{variant}.{hash8}.{ext}) give stable,
// unique device file names, so a repeat save reuses the earlier copy.
export function deviceFileName(key: string): string {
  const base = key
    .split("/")
    .slice(-2)
    .join("-")
    .replace(/[^A-Za-z0-9._-]/g, "-");
  return `bhaktara-${base.slice(-100)}`;
}
export function mimeTypeFor(request: Pick<MediaRequest, "variant">): string {
  const extension = request.variant.key.split(".").pop()?.toLowerCase() ?? "";
  return (
    request.variant.mime ??
    mimeByExtension[extension] ??
    "application/octet-stream"
  );
}

function resultFromError(error: unknown): PlatformResult {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code === "ERR_PERMISSION_DENIED")
    return { status: "permission-denied", permission: "storage" };
  if (code === "ERR_WRITE_SETTINGS_DENIED")
    return { status: "permission-denied", permission: "system-settings" };
  if (code === "ERR_UNSUPPORTED") return { status: "unavailable" };
  if (__DEV__) console.warn("Media action failed", error);
  return { status: "error" };
}

function removeQuietly(entry: File | Directory | null) {
  try {
    if (entry?.exists) entry.delete();
  } catch {
    // The OS clears the cache eventually; a leftover file is harmless.
  }
}

type DownloadedFile = { file: File; name: string; mimeType: string };
async function withDownload(
  request: MediaRequest,
  folder: string,
  write: (download: DownloadedFile) => Promise<unknown>,
  { keepFile = false } = {},
): Promise<PlatformResult> {
  const url = resolveMediaUrl(request.variant.key);
  if (!url) return { status: "unavailable" };
  const name = deviceFileName(request.variant.key);
  let file: File | null = null;
  try {
    const directory = new Directory(Paths.cache, folder);
    directory.create({ intermediates: true, idempotent: true });
    file = new File(directory, name);
    let lastPercent = -1;
    request.onProgress?.(0);
    await File.downloadFileAsync(url, file, {
      idempotent: true,
      signal: request.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : request.variant.bytes;
        if (!total) return request.onProgress?.(null);
        const percent = Math.min(100, Math.floor((bytesWritten / total) * 100));
        if (percent === lastPercent) return;
        lastPercent = percent;
        request.onProgress?.(percent / 100);
      },
    });
    // Writing to the device has no measurable progress.
    request.onProgress?.(null);
    await write({ file, name, mimeType: mimeTypeFor(request) });
    return { status: "success" };
  } catch (error) {
    return resultFromError(error);
  } finally {
    if (!keepFile) removeQuietly(file);
  }
}

export function createAndroidServices(
  native: BhaktaraMediaModule | null,
  loadSharing: () => Promise<
    Pick<typeof import("expo-sharing"), "isAvailableAsync" | "shareAsync">
  > = () => import("expo-sharing"),
): PlatformServices {
  const unavailable = async (): Promise<PlatformResult> => ({
    status: "unavailable",
  });
  const needsSystemPermission = () => {
    try {
      return !!native && !native.canWriteSettings();
    } catch {
      return true;
    }
  };
  return {
    ...stubServices,
    wallpaper: {
      get canSetWallpaperDirectly() {
        try {
          return native?.canSetWallpaper() ?? false;
        } catch {
          return false;
        }
      },
      setWallpaper: (request) =>
        native
          ? withDownload(request, SAVE_FOLDER, ({ file }) =>
              native.setWallpaperAsync(file.uri, request.target),
            )
          : unavailable(),
    },
    ringtone: {
      canSetRingtone: !!native,
      needsSystemPermission,
      requestSystemPermission: async () => {
        try {
          return (await native?.requestWriteSettingsAsync()) ?? false;
        } catch {
          return false;
        }
      },
      setRingtone: async (request) => {
        if (!native) return unavailable();
        // Check before downloading; the native call re-checks.
        if (needsSystemPermission())
          return { status: "permission-denied", permission: "system-settings" };
        return withDownload(request, SAVE_FOLDER, ({ file, name, mimeType }) =>
          native.setRingtoneAsync(
            file.uri,
            request.target,
            name,
            mimeType,
            request.title,
          ),
        );
      },
    },
    mediaSave: {
      canSave: !!native,
      save: (request) =>
        native
          ? withDownload(request, SAVE_FOLDER, ({ file, name, mimeType }) =>
              native.saveToLibraryAsync(
                file.uri,
                request.kind,
                name,
                mimeType,
                request.title,
              ),
            )
          : unavailable(),
    },
    share: {
      // expo-sharing ships in the same native build as this module.
      canShare: !!native,
      shareStatus: async (request) => {
        if (!native) return unavailable();
        let sharing: Awaited<ReturnType<typeof loadSharing>>;
        try {
          sharing = await loadSharing();
          if (!(await sharing.isAvailableAsync())) return unavailable();
        } catch {
          return unavailable();
        }
        removeQuietly(new Directory(Paths.cache, SHARE_FOLDER));
        return withDownload(
          request,
          SHARE_FOLDER,
          ({ file, mimeType }) =>
            sharing.shareAsync(file.uri, {
              mimeType,
              dialogTitle: request.title,
            }),
          { keepFile: true },
        );
      },
    },
  };
}

export const androidServices = createAndroidServices(BhaktaraMedia);
