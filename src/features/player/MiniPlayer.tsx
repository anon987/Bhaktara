import React from "react";
import { Pressable, View } from "react-native";
import { Pause, Play, X } from "lucide-react-native";
import { useApp } from "../../app/providers/AppProvider";
import { IconButton, Row, Txt } from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const {
    catalog,
    selectedContentId,
    selectContent,
    previewPlaying,
    setPreviewPlaying,
    local,
    t,
  } = useApp();
  const item = catalog?.content.find((value) => value.id === selectedContentId);
  if (!item) return null;
  return (
    <Row
      style={{
        backgroundColor: colors.pale,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 2,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("audioPreview")}: ${item.title[local.language]}`}
        onPress={onOpen}
        style={{
          flex: 1,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
          minHeight: 56,
        }}
      >
        <View style={{ width: 44 }}>
          <DevotionalArt assetKey={item.media.thumb.key} size={44} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={13} bold numberOfLines={1}>
            {item.title[local.language]}
          </Txt>
          <Txt size={10} muted>
            {t("audioPreview")}
          </Txt>
        </View>
      </Pressable>
      <IconButton
        icon={previewPlaying ? Pause : Play}
        label={t(previewPlaying ? "pause" : "play")}
        onPress={() => setPreviewPlaying(!previewPlaying)}
      />
      <IconButton
        icon={X}
        label={t("close")}
        onPress={() => {
          selectContent(null);
          setPreviewPlaying(false);
        }}
      />
    </Row>
  );
}
