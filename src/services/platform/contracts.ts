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
  // A picture-in-picture guide can stay on screen while the user is in system
  // settings, and Bhaktara returns by itself once the permission is on.
  canGuideSystemPermission?(): boolean;
  setRingtone(
    request: MediaRequest & { target: RingtoneTarget },
  ): Promise<PlatformResult>;
}
export interface MediaSaveService {
  readonly canSave: boolean;
  save(request: MediaRequest & { kind: SaveKind }): Promise<PlatformResult>;
}
// Doc 13 `content_share` channel: where the share actually opened.
export type ShareChannel = "whatsapp" | "instagram" | "facebook" | "other";
// The two WhatsApp apps; a phone can have both.
export type WhatsAppApp = "whatsapp" | "business";
// Apps a status video can go to besides WhatsApp.
export type SocialApp = "instagram" | "facebook";
export type ShareResult = PlatformResult & { channel?: ShareChannel };
export interface ShareService {
  readonly canShare: boolean;
  // System share sheet with a temporary cache copy; never saves to the gallery.
  shareStatus(request: MediaRequest): Promise<PlatformResult>;
  // Opens WhatsApp (then WhatsApp Business) straight to its chat picker with
  // the file and an optional caption; without either app it falls back to the
  // system share sheet. Free, never gated (D-041). A success reports the
  // channel that opened.
  shareToWhatsApp(
    request: MediaRequest & { text?: string },
    // Just this app (the user's pick when both are installed); otherwise
    // WhatsApp, then WhatsApp Business.
    app?: WhatsAppApp,
  ): Promise<ShareResult>;
  // Which WhatsApp apps are installed, WhatsApp first. Empty when unknown
  // (older builds); sharing then tries WhatsApp, then Business.
  installedWhatsApps(): WhatsAppApp[];
  // The same, straight to Instagram or Facebook (the user picks Story or
  // Feed there); without the app it falls back to the system share sheet.
  shareToApp(
    request: MediaRequest & { text?: string },
    app: SocialApp,
  ): Promise<ShareResult>;
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
