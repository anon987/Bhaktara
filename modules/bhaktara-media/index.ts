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
}

// Null on iOS, web, Jest and dev clients built before this module existed.
export const BhaktaraMedia =
  requireOptionalNativeModule<BhaktaraMediaModule>("BhaktaraMedia");
