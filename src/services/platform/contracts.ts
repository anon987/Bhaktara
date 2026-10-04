export type PlatformResult = {
  status: "unavailable" | "permission-denied" | "success";
};
export interface WallpaperService {
  canSetWallpaperDirectly: boolean;
  setWallpaper(key: string): Promise<PlatformResult>;
}
export interface RingtoneService {
  canSetRingtone: boolean;
  setRingtone(key: string): Promise<PlatformResult>;
}
export interface MediaSaveService {
  canSave: boolean;
  save(key: string): Promise<PlatformResult>;
}
export interface ShareService {
  canShare: boolean;
  shareStatus(key: string): Promise<PlatformResult>;
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
