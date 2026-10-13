import React from "react";
import { ActivityIndicator, View } from "react-native";
import { BellRing, Download, Share2, Smartphone } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Notice, Progress, Txt } from "../../components/ui";
import { Content } from "../../domain/models";
import { colors } from "../../theme/tokens";
import { useSaveActions } from "./useSaveActions";

// Save / Set / Share for wallpapers, ringtones and status videos (doc 03 content
// detail actions). Saves pass the rewarded gate (D-038); sharing is free (D-041).
// The logic lives in useSaveActions, shared with the full-screen wallpaper viewer.
export function SaveActions({ item }: { item: Content }) {
  const { t } = useApp();
  const actions = useSaveActions(item);
  const { setup, phase, busy, mediaReady } = actions;
  if (!setup) return null;
  return (
    <Card>
      {actions.gated && (
        <Txt muted size={13}>
          {t("rewardedHint")}
        </Txt>
      )}
      <Button
        icon={Download}
        label={t(setup.saveLabel)}
        disabled={busy || !mediaReady || !actions.canSave}
        onPress={actions.save}
      />
      {actions.canSetWallpaper && (
        <Button
          secondary
          icon={Smartphone}
          label={t("setWallpaper")}
          disabled={busy || !mediaReady}
          onPress={actions.setWallpaper}
        />
      )}
      {actions.canSetRingtone && (
        <Button
          secondary
          icon={BellRing}
          label={t("setRingtone")}
          disabled={busy || !mediaReady}
          onPress={actions.setRingtone}
        />
      )}
      {item.type === "STATUS" && (
        <Button
          secondary
          icon={Share2}
          label={t("share")}
          disabled={busy || !mediaReady || !actions.canShare}
          onPress={actions.share}
        />
      )}
      {!mediaReady ? (
        <Notice text={t("mediaUnavailable")} />
      ) : (
        !actions.canSave && <Notice text={t("actionUnavailable")} />
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
              onPress={actions.openSettings}
            />
            {phase.permission === "storage" && (
              <Button secondary label={t("retry")} onPress={actions.retry} />
            )}
          </>
        )}
        {phase.name === "error" && (
          <>
            <Txt muted>{t("saveFailed")}</Txt>
            <Button secondary label={t("retry")} onPress={actions.retry} />
          </>
        )}
      </View>
      {actions.permissionSheet}
    </Card>
  );
}
