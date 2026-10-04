import React from "react";
import { Pressable, View } from "react-native";
import { Heart, Play } from "lucide-react-native";
import { Content } from "../domain/models";
import { useApp } from "../app/providers/AppProvider";
import { DevotionalArt } from "./DevotionalArt";
import { IconButton, Row, Txt } from "./ui";
import { colors } from "../theme/tokens";
import { formatTime } from "../domain/practice";
export function ContentCard({
  item,
  onPress,
  compact = false,
}: {
  item: Content;
  onPress: () => void;
  compact?: boolean;
}) {
  const { local, t, toggleFavorite } = useApp();
  const favorite = local.favorites.includes(item.id);
  if (compact)
    return (
      <Row
        style={{
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title[local.language]}
          onPress={onPress}
          style={{
            flex: 1,
            flexDirection: "row",
            gap: 14,
            alignItems: "center",
            minHeight: 76,
          }}
        >
          <View style={{ width: 70 }}>
            <DevotionalArt assetKey={item.media.thumb.key} size={76} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold>{item.title[local.language]}</Txt>
            <Txt size={12} muted>
              {t(item.type.toLowerCase() as "bhajan")}{" "}
              {item.durationSeconds
                ? `· ${formatTime(item.durationSeconds)}`
                : ""}
            </Txt>
          </View>
        </Pressable>
        <IconButton
          icon={Heart}
          label={t(favorite ? "unfavorite" : "favorite")}
          selected={favorite}
          color={colors.primary}
          onPress={() => toggleFavorite(item.id)}
        />
      </Row>
    );
  return (
    <View style={{ width: 170, gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title[local.language]}
        onPress={onPress}
      >
        <DevotionalArt assetKey={item.media.thumb.key} size={166} />
        <View
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            backgroundColor: colors.surface,
            padding: 10,
            borderRadius: 30,
          }}
        >
          <Play size={16} color={colors.primary} fill={colors.primary} />
        </View>
      </Pressable>
      <Txt bold>{item.title[local.language]}</Txt>
      <Txt size={12} muted>
        {t(item.type.toLowerCase() as "bhajan")}{" "}
        {item.durationSeconds ? `· ${formatTime(item.durationSeconds)}` : ""}
      </Txt>
    </View>
  );
}
