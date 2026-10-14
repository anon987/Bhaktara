import { requireOptionalNativeModule } from "expo";

// Typed JS API for the local Android module in ./android (Expo Modules API).
// Every file argument is a file:// URI inside the app cache; display names are
// plain file names ([A-Za-z0-9._-]). Rejections carry one of BhaktaraMediaErrorCode.
export type NativeMediaKind = "image" | "video" | "audio";
export type NativeWallpaperTarget = "home" | "lock" | "both";
export type NativeRingtoneTarget = "ringtone" | "notification" | "alarm";
export type BhaktaraMediaErrorCode =
  | "ERR_PERMISSION_DENIED"
  | "ERR_WRITE_SETTINGS_DENIED"
  | "ERR_UNSUPPORTED"
  | "ERR_INVALID_ARGUMENT"
  | "ERR_MEDIA_WRITE";

export interface BhaktaraMediaModule {
  /** WallpaperManager supports and allows setting the wallpaper. */
  canSetWallpaper(): boolean;
  /** The "Modify system settings" app-op needed to set a ringtone is granted. */
  canWriteSettings(): boolean;
  /** Opens the system settings screen; resolves on return with the new state. */
  requestWriteSettingsAsync(): Promise<boolean>;
  /** Picture-in-picture is supported and not switched off for Bhaktara. */
  canUsePictureInPicture(): boolean;
  /**
   * Shrinks Bhaktara into a picture-in-picture guide and opens the "Modify
   * system settings" screen. Resolves false (opening nothing) if PiP is unavailable.
   */
  openWriteSettingsWithGuideAsync(): Promise<boolean>;
  /**
   * Waits natively until "Modify system settings" is on, then brings Bhaktara
   * back to full screen. Resolves false if stopped or after 10 minutes.
   */
  waitForWriteSettingsAsync(): Promise<boolean>;
  /** Ends a pending waitForWriteSettingsAsync with false. */
  stopWaitingForWriteSettings(): void;
  /** Saves into Pictures, Movies or Ringtones /Bhaktara. Resolves with a content:// URI. */
  saveToLibraryAsync(
    fileUri: string,
    kind: NativeMediaKind,
    displayName: string,
    mimeType: string,
    title: string,
  ): Promise<string>;
  setWallpaperAsync(
    fileUri: string,
    target: NativeWallpaperTarget,
  ): Promise<boolean>;
  /** Saves into Ringtones/Bhaktara and sets it as the default sound. */
  setRingtoneAsync(
    fileUri: string,
    target: NativeRingtoneTarget,
    displayName: string,
    mimeType: string,
    title: string,
  ): Promise<string>;
  /**
   * Opens one app's share screen (ACTION_SEND with setPackage) for a cache file,
   * shared through the module's FileProvider with read permission granted.
   * `text` becomes the caption. Resolves false, opening nothing, when the app
   * is not installed. Missing in dev clients built before it was added.
   */
  shareToAppAsync?(
    fileUri: string,
    mimeType: string,
    packageName: string,
    text?: string | null,
  ): Promise<boolean>;
  /**
   * The app is installed and visible to Bhaktara (declared under <queries>).
   * Missing in dev clients built before it was added.
   */
  isAppInstalled?(packageName: string): boolean;
  /**
   * The Firebase project's OAuth web client ID (default_web_client_id from
   * google-services.json), or null. Missing in builds before it was added.
   */
  googleWebClientId?(): string | null;
}

// Null on iOS, web, Jest and dev clients built before this module existed.
export const BhaktaraMedia =
  requireOptionalNativeModule<BhaktaraMediaModule>("BhaktaraMedia");
