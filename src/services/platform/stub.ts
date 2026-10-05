import { PlatformResult, PlatformServices } from "./contracts";
const unavailable = async (): Promise<PlatformResult> => ({
  status: "unavailable",
});
export const stubServices: PlatformServices = {
  wallpaper: { canSetWallpaperDirectly: false, setWallpaper: unavailable },
  ringtone: {
    canSetRingtone: false,
    needsSystemPermission: () => false,
    requestSystemPermission: async () => false,
    setRingtone: unavailable,
  },
  mediaSave: { canSave: false, save: unavailable },
  share: { canShare: false, shareStatus: unavailable },
  notifications: { canRequest: false, request: unavailable },
};
