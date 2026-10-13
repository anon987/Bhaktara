import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BellRing, ChevronLeft, Play } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  Notice,
  Page,
  Progress,
  Row,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { Content, ContentType, Deity } from "../../domain/models";
import { formatTime } from "../../domain/practice";
import { StringKey } from "../../i18n/strings";
import { analytics } from "../../services/analytics";
import { resolveMediaUrl } from "../../services/media/config";
import { colors, sanctum } from "../../theme/tokens";
import { StatusPager } from "../content/StatusPager";
import { useSaveActions } from "../content/useSaveActions";
import { RoundButton, WallpaperViewer } from "../content/WallpaperViewer";
import { usePlayer } from "../player/PlayerProvider";
import { playableVariant, PlaySource } from "../player/playback";
import { DeityCircle } from "./DeityCircle";
import { useDeityItems } from "./useDeityContent";

type Props = NativeStackScreenProps<RootParams, "DeityContent">;

// One god's items of one category, opened from Explore. Wallpapers and status
// videos open full screen on the first one; audio is a simple list to play.
export function DeityContentScreen({ route, navigation }: Props) {
  const { deityId, type } = route.params;
  const source = route.params.source ?? "explore";
  const { items, status, retry } = useDeityItems(type, deityId);
  const visual = type === "WALLPAPER" || type === "STATUS";
  if (visual && status === "ready" && items.length)
    return type === "WALLPAPER" ? (
      <WallpaperViewer
        item={items[0]}
        pages={items}
        source={source}
        onBack={navigation.goBack}
      />
    ) : (
      <StatusPager items={items} source={source} onBack={navigation.goBack} />
    );
  if (visual)
    return (
      <FullBleedState
        status={status}
        onRetry={retry}
        onBack={navigation.goBack}
      />
    );
  return (
    <DeityList
      deityId={deityId}
      type={type}
      source={source}
      items={items}
      status={status}
      onRetry={retry}
      onBack={navigation.goBack}
      onPlay={(item) => {
        analytics.track("content_view", {
          content_id: item.id,
          content_type: item.type,
          source,
        });
        navigation.navigate("Player");
      }}
    />
  );
}

// Loading, failure or nothing-yet on the dark ground the viewers open onto.
function FullBleedState({
  status,
  onRetry,
  onBack,
}: {
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 14 + insets.left,
        }}
      >
        <RoundButton icon={ChevronLeft} label={t("close")} onPress={onBack} />
      </View>
      {status === "loading" ? (
        <ActivityIndicator
          size="large"
          color={sanctum.brass}
          accessibilityLabel={t("loading")}
        />
      ) : (
        <View style={styles.darkMessage}>
          <Txt bold size={20} style={styles.darkText}>
            {t(status === "error" ? "error" : "deityEmpty")}
          </Txt>
          {status === "error" && (
            <Button label={t("retry")} onPress={onRetry} />
          )}
        </View>
      )}
    </View>
  );
}

function DeityList({
  deityId,
  type,
  source,
  items,
  status,
  onRetry,
  onBack,
  onPlay,
}: {
  deityId: string;
  type: ContentType;
  source: PlaySource;
  items: Content[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  onBack: () => void;
  onPlay: (item: Content) => void;
}) {
  const { catalog, local, t } = useApp();
  const player = usePlayer();
  const deity = catalog?.deities.find((value) => value.id === deityId);
  return (
    <Page title={t(type.toLowerCase() as StringKey)} onBack={onBack}>
      {deity && <DeityHeader deity={deity} />}
      {status === "loading" && (
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel={t("loading")}
        />
      )}
      {status === "error" && (
        <Card style={{ alignItems: "center" }}>
          <Txt bold>{t("error")}</Txt>
          <Button label={t("retry")} onPress={onRetry} />
        </Card>
      )}
      {status === "ready" && !items.length && (
        <Card style={{ alignItems: "center" }}>
          <Txt bold size={18} style={{ textAlign: "center" }}>
            {t("deityEmpty")}
          </Txt>
        </Card>
      )}
      {items.map((item) => (
        <AudioRow
          key={item.id}
          item={item}
          title={item.title[local.language]}
          onPlay={() => {
            player.load(item, source);
            onPlay(item);
          }}
        />
      ))}
    </Page>
  );
}

function DeityHeader({ deity }: { deity: Deity }) {
  const { local } = useApp();
  return (
    <View style={styles.header}>
      <DeityCircle deity={deity} size={150} />
      <Txt bold size={28} style={{ textAlign: "center" }}>
        {deity.name[local.language]}
      </Txt>
    </View>
  );
}

// Cover, title and a big play button; the whole row plays. Ringtones also
// offer "Set as ringtone" (the rewarded gate and permissions as everywhere).
function AudioRow({
  item,
  title,
  onPlay,
}: {
  item: Content;
  title: string;
  onPlay: () => void;
}) {
  const { t } = useApp();
  const variant = playableVariant(item);
  const playable = Boolean(variant && resolveMediaUrl(variant.key));
  return (
    <Card style={styles.row}>
      <Pressable
        testID={`play-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${t("play")} · ${title}`}
        onPress={onPlay}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={styles.thumb}>
          <DevotionalArt assetKey={item.media.thumb.key} size={68} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt bold size={18} numberOfLines={3}>
            {title}
          </Txt>
          {!!item.durationSeconds && (
            <Txt muted size={14}>
              {formatTime(item.durationSeconds)}
            </Txt>
          )}
        </View>
        <View style={styles.play}>
          <Play size={28} color={colors.white} fill={colors.white} />
        </View>
      </Pressable>
      {!playable && <Notice text={t("audioUnavailable")} />}
      {item.type === "RINGTONE" && <RingtoneAction item={item} />}
    </Card>
  );
}

function RingtoneAction({ item }: { item: Content }) {
  const { t } = useApp();
  const actions = useSaveActions(item);
  const { phase } = actions;
  if (!actions.canSetRingtone) return null;
  return (
    <View style={{ gap: 10 }}>
      <Button
        secondary
        icon={BellRing}
        label={
          actions.gated
            ? `${t("setRingtone")} · ${t("adBadge")}`
            : t("setRingtone")
        }
        disabled={actions.busy || !actions.mediaReady}
        onPress={actions.setRingtone}
      />
      <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
        {phase.name === "working" &&
          (phase.progress === null ? (
            <Row>
              <ActivityIndicator color={colors.primary} />
              <Txt muted>{t("savingToPhone")}</Txt>
            </Row>
          ) : (
            <Progress value={phase.progress} label={t("downloading")} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  dark: {
    flex: 1,
    backgroundColor: sanctum.night,
    alignItems: "center",
    justifyContent: "center",
  },
  darkMessage: { alignItems: "center", gap: 18, padding: 32 },
  darkText: { color: sanctum.text, textAlign: "center" },
  header: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    borderRadius: 28,
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: sanctum.brassLight,
  },
  row: { padding: 12, gap: 10 },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
  },
  thumb: { width: 68, borderRadius: 14, overflow: "hidden" },
  play: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: sanctum.brass,
  },
  pressed: { opacity: 0.72 },
});
