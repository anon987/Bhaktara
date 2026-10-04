import React, { useState } from "react";
import { View } from "react-native";
import { Heart, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  IconButton,
  Notice,
  Page,
  Progress,
  Row,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { formatTime } from "../../domain/practice";
export function PlayerScreen({
  navigation,
}: NativeStackScreenProps<RootParams, "Player">) {
  const {
    catalog,
    local,
    t,
    selectedContentId,
    previewPlaying,
    setPreviewPlaying,
    toggleFavorite,
  } = useApp();
  const item = catalog?.content.find((value) => value.id === selectedContentId);
  const [position, setPosition] = useState(0);
  if (!item)
    return (
      <Page title={t("audioPreview")} onBack={navigation.goBack}>
        <Txt>{t("noResults")}</Txt>
      </Page>
    );
  const duration = item.durationSeconds ?? 300;
  const favorite = local.favorites.includes(item.id);
  return (
    <Page title={t("nowPlaying")} onBack={navigation.goBack}>
      <DevotionalArt assetKey={item.media.thumb.key} size={320} />
      <Txt size={11} muted style={{ textAlign: "center" }}>
        {t("placeholder")}
      </Txt>
      <Row>
        <View style={{ flex: 1 }}>
          <Txt bold size={25}>
            {item.title[local.language]}
          </Txt>
          <Txt muted size={13}>
            Bhaktara
          </Txt>
        </View>
        <IconButton
          icon={Heart}
          selected={favorite}
          color={colors.primary}
          label={t(favorite ? "unfavorite" : "favorite")}
          onPress={() => toggleFavorite(item.id)}
        />
      </Row>
      <Progress value={position / duration} label={t("audioPreview")} />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt size={12} muted>
          {formatTime(position)}
        </Txt>
        <Txt size={12} muted>
          {formatTime(duration)}
        </Txt>
      </Row>
      <Row style={{ justifyContent: "center", gap: 28 }}>
        <IconButton
          icon={RotateCcw}
          label={local.language === "hi" ? "15 सेकंड पीछे" : "Back 15 seconds"}
          onPress={() => setPosition((value) => Math.max(0, value - 15))}
        />
        <Button
          style={{ minWidth: 130, minHeight: 70, borderRadius: 35 }}
          icon={previewPlaying ? Pause : Play}
          label={t(previewPlaying ? "pause" : "play")}
          onPress={() => setPreviewPlaying(!previewPlaying)}
        />
        <IconButton
          icon={RotateCw}
          label={
            local.language === "hi" ? "15 सेकंड आगे" : "Forward 15 seconds"
          }
          onPress={() => setPosition((value) => Math.min(duration, value + 15))}
        />
      </Row>
      <Txt style={{ textAlign: "center", color: colors.primary }}>
        {previewPlaying ? t("pause") : t("play")}
      </Txt>
      <Notice text={t("noAudio")} />
    </Page>
  );
}
