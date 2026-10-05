import { MediaVariant } from "../../domain/media";

export type PlatformResult =
  | { status: "success" }
  // Not possible here: no CDN media, no native support, or the device refuses.
  | { status: "unavailable" }
  // "storage": the legacy (Android 9 and older) storage permission was denied.
  // "system-settings": "Modify system settings" is off (needed for ringtones).
  | { status: "permission-denied"; permission: "storage" | "system-settings" }
  | { status: "error" };

// Download progress from 0 to 1, or null while the size is unknown or the
// file is being written to the device.
export type ProgressListener = (fraction: number | null) => void;
export type MediaRequest = {
  contentId: string;
  // Shown in the device's gallery or ringtone picker.
  title: string;
  variant: MediaVariant;
  onProgress?: ProgressListener;
  signal?: AbortSignal;
};
export type SaveKind = "image" | "video" | "audio";
export type WallpaperTarget = "home" | "lock" | "both";
export type RingtoneTarget = "ringtone" | "notification" | "alarm";

export interface WallpaperService {
  readonly canSetWallpaperDirectly: boolean;
  setWallpaper(
    request: MediaRequest & { target: WallpaperTarget },
  ): Promise<PlatformResult>;
}
export interface RingtoneService {
  readonly canSetRingtone: boolean;
  // Android needs the "Modify system settings" special permission first.
  needsSystemPermission(): boolean;
  // Opens the system screen; resolves when the user returns, with the result.
  requestSystemPermission(): Promise<boolean>;
  setRingtone(
    request: MediaRequest & { target: RingtoneTarget },
  ): Promise<PlatformResult>;
}
export interface MediaSaveService {
  readonly canSave: boolean;
  save(request: MediaRequest & { kind: SaveKind }): Promise<PlatformResult>;
}
export interface ShareService {
  readonly canShare: boolean;
  // System share sheet with a temporary cache copy; never saves to the gallery.
  shareStatus(request: MediaRequest): Promise<PlatformResult>;
}
export interface NotificationPermissionService {
  canRequest: boolean;
  request(): Promise<PlatformResult>;
}
export type PlatformServices = {
  wallpaper: WallpaperService;
  ringtone: RingtoneService;
  mediaSave: MediaSaveService;
  share: ShareService;
  notifications: NotificationPermissionService;
};
