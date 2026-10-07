import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { BellRing, Download, Share2, Smartphone } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Notice, Progress, Txt } from "../../components/ui";
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
  PlatformResult,
  RingtoneTarget,
  SaveKind,
  WallpaperTarget,
} from "../../services/platform/contracts";
import { colors } from "../../theme/tokens";
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

type Action =
  | { kind: "save" }
  | { kind: "set-wallpaper"; target: WallpaperTarget }
  | { kind: "set-ringtone"; target: RingtoneTarget }
  | { kind: "share" };
type Phase =
  | { name: "idle" }
  | { name: "working"; progress: number | null }
  | { name: "done"; message: StringKey }
  | {
      name: "permission";
      permission: "storage" | "system-settings";
      action: Action;
      via?: SaveVia;
    }
  | { name: "unavailable" }
  | { name: "error"; action: Action; via?: SaveVia };

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

// Save / Set / Share for wallpapers, ringtones and status videos (doc 03 content
// detail actions). Saves pass the rewarded gate (D-038); sharing is free (D-041).
export function SaveActions({ item }: { item: Content }) {
  const { t, local } = useApp();
  const showDialog = useDialog();
  // The pending "Set as ringtone" waiting on the system-settings explainer.
  const [permissionAsk, setPermissionAsk] = useState<{
    action: Action;
    via?: SaveVia;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
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
  const setup = setups[item.type];
  if (!setup) return null;
  const savedMessage = setup.saved;
  const services = platformServices;
  const variant = item.media[setup.variant];
  const mediaReady = !!variant && resolveMediaUrl(variant.key) !== null;
  const busy = phase.name === "working";
  const params = { content_id: item.id, content_type: item.type };
  const update = (next: Phase) => {
    if (mounted.current) setPhase(next);
  };

  const execute = (
    action: Action,
    request: MediaRequest,
  ): Promise<PlatformResult> => {
    switch (action.kind) {
      case "save":
        return services.mediaSave.save({ ...request, kind: setup.kind });
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
    }
  };

  async function run(
    action: Action,
    options: { via?: SaveVia; tapped?: boolean } = {},
  ) {
    if (!variant || running.current) return;
    running.current = true;
    try {
      await attempt(action, variant, options);
    } finally {
      running.current = false;
    }
  }

  async function attempt(
    action: Action,
    media: MediaVariant,
    { via, tapped = false }: { via?: SaveVia; tapped?: boolean },
  ) {
    const isSave = action.kind !== "share";
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
    let result: PlatformResult;
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
      if (action.kind === "share") {
        analytics.track("content_share", { ...params, channel: "other" });
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
      return update({ name: "done", message: savedMessage });
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

  async function requestSystemPermission(action: Action, via?: SaveVia) {
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

  return (
    <Card>
      {saveGateFor(item) === "rewarded" && (
        <Txt muted size={13}>
          {t("rewardedHint")}
        </Txt>
      )}
      <Button
        icon={Download}
        label={t(setup.saveLabel)}
        disabled={busy || !mediaReady || !services.mediaSave.canSave}
        onPress={() => void run({ kind: "save" })}
      />
      {item.type === "WALLPAPER" &&
        services.wallpaper.canSetWallpaperDirectly && (
          <Button
            secondary
            icon={Smartphone}
            label={t("setWallpaper")}
            disabled={busy || !mediaReady}
            onPress={() =>
              choose(
                "wallpaperTarget",
                "wallpaperTargetHint",
                wallpaperTargets,
                (target) => void run({ kind: "set-wallpaper", target }),
              )
            }
          />
        )}
      {item.type === "RINGTONE" && services.ringtone.canSetRingtone && (
        <Button
          secondary
          icon={BellRing}
          label={t("setRingtone")}
          disabled={busy || !mediaReady}
          onPress={() =>
            choose(
              "ringtoneTarget",
              "ringtoneTargetHint",
              ringtoneTargets,
              (target) => void run({ kind: "set-ringtone", target }),
            )
          }
        />
      )}
      {item.type === "STATUS" && (
        <Button
          secondary
          icon={Share2}
          label={t("share")}
          disabled={busy || !mediaReady || !services.share.canShare}
          onPress={() => void run({ kind: "share" })}
        />
      )}
      {!mediaReady ? (
        <Notice text={t("mediaUnavailable")} />
      ) : (
        !services.mediaSave.canSave && <Notice text={t("actionUnavailable")} />
      )}
      <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
        {phase.name === "working" &&
          (phase.progress === null ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <ActivityIndicator color={colors.primary} />
              <Txt muted>{t("savingToPhone")}</Txt>
            </View>
          ) : (
            <>
              <Txt muted>
                {`${t("downloading")} · ${Math.round(phase.progress * 100)}%`}
              </Txt>
              <Progress value={phase.progress} label={t("downloading")} />
            </>
          ))}
        {phase.name === "done" && <Txt bold>{t(phase.message)}</Txt>}
        {phase.name === "unavailable" && (
          <Txt muted>{t("actionUnavailable")}</Txt>
        )}
        {phase.name === "permission" && (
          <>
            <Txt muted>
              {t(
                phase.permission === "storage"
                  ? "storagePermissionDenied"
                  : "systemPermissionDenied",
              )}
            </Txt>
            <Button
              secondary
              label={t("openSettings")}
              onPress={() =>
                phase.permission === "storage"
                  ? void Linking.openSettings().catch(() => undefined)
                  : void requestSystemPermission(phase.action, phase.via)
              }
            />
            {phase.permission === "storage" && (
              <Button
                secondary
                label={t("retry")}
                onPress={() =>
                  void run(phase.action, { via: phase.via, tapped: true })
                }
              />
            )}
          </>
        )}
        {phase.name === "error" && (
          <>
            <Txt muted>{t("saveFailed")}</Txt>
            <Button
              secondary
              label={t("retry")}
              onPress={() =>
                void run(phase.action, { via: phase.via, tapped: true })
              }
            />
          </>
        )}
      </View>
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
    </Card>
  );
}
