import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useApp } from "../../app/providers/AppProvider";
import { useDialog } from "../../components/dialogContext";
import { MediaVariant, MediaVariantName } from "../../domain/media";
import { Content } from "../../domain/models";
import { rewardedUnlockType, SaveVia } from "../../domain/saveGate";
import { StringKey } from "../../i18n/strings";
import { saveGateFor, unlockSave } from "../../services/ads/rewardedGate";
import { analytics } from "../../services/analytics";
import { resolveMediaUrl } from "../../services/media/config";
import { platformServices } from "../../services/platform";
import {
  MediaRequest,
  RingtoneTarget,
  SaveKind,
  ShareResult,
  WallpaperTarget,
} from "../../services/platform/contracts";
import { SystemPermissionSheet } from "./SystemPermissionSheet";

// Doc 22 §A3: the master files used for Save/Set.
const setups: Partial<
  Record<
    Content["type"],
    {
      variant: MediaVariantName;
      kind: SaveKind;
      saveLabel: StringKey;
      saved: StringKey;
    }
  >
> = {
  WALLPAPER: {
    variant: "full",
    kind: "image",
    saveLabel: "saveWallpaper",
    saved: "savedToGallery",
  },
  RINGTONE: {
    variant: "file",
    kind: "audio",
    saveLabel: "saveRingtone",
    saved: "savedRingtone",
  },
  STATUS: {
    variant: "video720",
    kind: "video",
    saveLabel: "saveStatus",
    saved: "savedToGallery",
  },
};

export type SaveAction =
  | { kind: "save" }
  | { kind: "set-wallpaper"; target: WallpaperTarget }
  | { kind: "set-ringtone"; target: RingtoneTarget }
  // System share sheet (status videos).
  | { kind: "share" }
  // Straight into WhatsApp, falling back to the share sheet (wallpapers).
  | { kind: "share-whatsapp" };
export type SavePhase =
  | { name: "idle" }
  | { name: "working"; progress: number | null }
  | { name: "done"; message: StringKey }
  | {
      name: "permission";
      permission: "storage" | "system-settings";
      action: SaveAction;
      via?: SaveVia;
    }
  | { name: "unavailable" }
  | { name: "error"; action: SaveAction; via?: SaveVia };

const wallpaperTargets: [WallpaperTarget, StringKey][] = [
  ["home", "targetHome"],
  ["lock", "targetLock"],
  ["both", "targetBoth"],
];
const ringtoneTargets: [RingtoneTarget, StringKey][] = [
  ["ringtone", "targetRingtone"],
  ["notification", "targetNotification"],
  ["alarm", "targetAlarm"],
];

const isShare = (action: SaveAction) =>
  action.kind === "share" || action.kind === "share-whatsapp";

// WhatsApp gets the large master (doc 22 §A3), or the phone-sized copy;
// status videos send their 720p video.
const whatsappVariant = (item: Content) =>
  item.type === "STATUS"
    ? item.media.video720
    : (item.media.full ?? item.media.mobile);

// Save / Set / Share logic shared by the content card (SaveActions) and the
// full-screen wallpaper viewer: the rewarded gate (D-038), permissions,
// download progress and analytics. Sharing is free (D-041). The caller draws
// `phase`, and must render `permissionSheet` for the ringtone explainer.
export function useSaveActions(item: Content) {
  const { t, local } = useApp();
  const showDialog = useDialog();
  // The pending "Set as ringtone" waiting on the system-settings explainer.
  const [permissionAsk, setPermissionAsk] = useState<{
    action: SaveAction;
    via?: SaveVia;
  } | null>(null);
  const [phase, setPhase] = useState<SavePhase>({ name: "idle" });
  const mounted = useRef(true);
  // Guards against a double tap before the busy state renders.
  const running = useRef(false);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      download.current?.abort();
    };
  }, []);
  // A new item (the viewer pages between wallpapers) starts with no message.
  useEffect(() => {
    if (!running.current) setPhase({ name: "idle" });
  }, [item.id]);
  const setup = setups[item.type];
  const services = platformServices;
  const variant = setup ? item.media[setup.variant] : undefined;
  const mediaReady = !!variant && resolveMediaUrl(variant.key) !== null;
  const shareMedia = whatsappVariant(item);
  const shareReady = !!shareMedia && resolveMediaUrl(shareMedia.key) !== null;
  const busy = phase.name === "working";
  const params = { content_id: item.id, content_type: item.type };
  const update = (next: SavePhase) => {
    if (mounted.current) setPhase(next);
  };
  const mediaFor = (action: SaveAction) =>
    action.kind === "share-whatsapp" ? shareMedia : variant;

  const execute = (
    action: SaveAction,
    request: MediaRequest,
  ): Promise<ShareResult> => {
    switch (action.kind) {
      case "save":
        return services.mediaSave.save({
          ...request,
          kind: setup?.kind ?? "image",
        });
      case "set-wallpaper":
        return services.wallpaper.setWallpaper({
          ...request,
          target: action.target,
        });
      case "set-ringtone":
        return services.ringtone.setRingtone({
          ...request,
          target: action.target,
        });
      case "share":
        return services.share.shareStatus(request);
      case "share-whatsapp":
        return services.share.shareToWhatsApp({
          ...request,
          text: t(
            item.type === "STATUS" ? "shareCaptionStatus" : "shareCaption",
          ),
        });
    }
  };

  async function run(
    action: SaveAction,
    options: { via?: SaveVia; tapped?: boolean } = {},
  ) {
    const media = mediaFor(action);
    if (!media || running.current) return;
    running.current = true;
    try {
      await attempt(action, media, options);
    } finally {
      running.current = false;
    }
  }

  async function attempt(
    action: SaveAction,
    media: MediaVariant,
    { via, tapped = false }: { via?: SaveVia; tapped?: boolean },
  ) {
    const isSave = !isShare(action);
    if (isSave && !tapped && !via) analytics.track("content_save_tap", params);
    // Doc 03: the system-settings permission is asked only on "Set as ringtone",
    // and before any ad so the user never watches one for nothing.
    if (
      action.kind === "set-ringtone" &&
      services.ringtone.needsSystemPermission()
    ) {
      setPermissionAsk({ action, via });
      return;
    }
    let unlockedVia = via;
    if (isSave && !unlockedVia) {
      const unlockType = rewardedUnlockType(item.type);
      if (!unlockType) return;
      const unlock = await unlockSave(item, unlockType);
      if (!unlock.unlocked) return;
      unlockedVia = unlock.via;
    }
    const controller = new AbortController();
    download.current = controller;
    update({ name: "working", progress: 0 });
    let result: ShareResult;
    try {
      result = await execute(action, {
        contentId: item.id,
        title: item.title[local.language],
        variant: media,
        signal: controller.signal,
        onProgress: (progress) => update({ name: "working", progress }),
      });
    } catch {
      result = { status: "error" };
    }
    if (download.current === controller) download.current = null;
    if (!mounted.current) return;
    if (result.status === "success") {
      if (isShare(action)) {
        analytics.track("content_share", {
          ...params,
          channel: result.channel ?? "other",
        });
        return update({ name: "idle" });
      }
      analytics.track("content_save_success", {
        ...params,
        via: unlockedVia ?? "free",
      });
      if (action.kind === "set-wallpaper") {
        analytics.track("set_wallpaper", { ...params, target: action.target });
        return update({ name: "done", message: "wallpaperSet" });
      }
      if (action.kind === "set-ringtone") {
        analytics.track("set_ringtone", { ...params, target: action.target });
        return update({ name: "done", message: "ringtoneSet" });
      }
      return update({
        name: "done",
        message: setup?.saved ?? "savedToGallery",
      });
    }
    if (result.status === "permission-denied")
      return update({
        name: "permission",
        permission: result.permission,
        action,
        via: unlockedVia,
      });
    if (result.status === "unavailable") return update({ name: "unavailable" });
    if (isSave) analytics.track("save_failed", params);
    update({ name: "error", action, via: unlockedVia });
  }

  async function requestSystemPermission(action: SaveAction, via?: SaveVia) {
    const granted = await services.ringtone.requestSystemPermission();
    if (!mounted.current) return;
    if (granted) return run(action, { via, tapped: true });
    update({ name: "permission", permission: "system-settings", action, via });
  }

  const choose = <T extends string>(
    title: StringKey,
    hint: StringKey,
    targets: [T, StringKey][],
    onChoose: (target: T) => void,
  ) =>
    showDialog(t(title), t(hint), [
      ...targets.map(([target, label]) => ({
        text: t(label),
        onPress: () => onChoose(target),
      })),
      { text: t("cancel"), style: "cancel" as const },
    ]);

  const dismiss = useCallback(() => {
    if (mounted.current && !running.current) setPhase({ name: "idle" });
  }, []);

  return {
    setup,
    phase,
    busy,
    // The Save/Set master exists and resolves to the CDN.
    mediaReady,
    // The WhatsApp copy (full, else mobile; video720 for status) exists and
    // resolves to the CDN.
    shareReady,
    gated: saveGateFor(item) === "rewarded",
    canSave: services.mediaSave.canSave,
    canSetWallpaper:
      item.type === "WALLPAPER" && services.wallpaper.canSetWallpaperDirectly,
    canSetRingtone:
      item.type === "RINGTONE" && services.ringtone.canSetRingtone,
    canShare: services.share.canShare,
    save: () => void run({ kind: "save" }),
    share: () => void run({ kind: "share" }),
    shareToWhatsApp: () => void run({ kind: "share-whatsapp" }),
    // Home / lock / both chooser, then the rewarded gate.
    setWallpaper: () =>
      choose(
        "wallpaperTarget",
        "wallpaperTargetHint",
        wallpaperTargets,
        (target) => void run({ kind: "set-wallpaper", target }),
      ),
    setRingtone: () =>
      choose(
        "ringtoneTarget",
        "ringtoneTargetHint",
        ringtoneTargets,
        (target) => void run({ kind: "set-ringtone", target }),
      ),
    // Retries the failed or refused action without passing the gate again.
    retry: () => {
      if (phase.name === "error" || phase.name === "permission")
        void run(phase.action, { via: phase.via, tapped: true });
    },
    // "Open settings" for a refused storage or system-settings permission.
    openSettings: () => {
      if (phase.name !== "permission") return;
      if (phase.permission === "storage")
        void Linking.openSettings().catch(() => undefined);
      else void requestSystemPermission(phase.action, phase.via);
    },
    dismiss,
    permissionSheet: (
      <SystemPermissionSheet
        visible={!!permissionAsk}
        guided={services.ringtone.canGuideSystemPermission?.() ?? false}
        onContinue={() => {
          const pending = permissionAsk;
          setPermissionAsk(null);
          if (pending)
            void requestSystemPermission(pending.action, pending.via);
        }}
        onCancel={() => setPermissionAsk(null)}
      />
    ),
  };
}
export type SaveActionsController = ReturnType<typeof useSaveActions>;
