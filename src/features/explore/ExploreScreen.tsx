import React, { useEffect } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { Page, Txt } from "../../components/ui";
import { contentTypeIcons } from "../../components/contentTypeIcons";
import { ContentType, contentTypes } from "../../domain/models";
import { StringKey } from "../../i18n/strings";
import { colors, sanctum } from "../../theme/tokens";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Explore">,
  NativeStackScreenProps<RootParams>
>;

// Wallpapers first: the most looked-at; then the audio, ringtones, statuses.
const categories: ContentType[] = [
  "WALLPAPER",
  "BHAJAN",
  "AARTI",
  "MANTRA",
  "CHALISA",
  "RINGTONE",
  "STATUS",
];
// Page padding (22 each side) and the widest page (ui.tsx Page).
const PAGE_PADDING = 44;
const PAGE_MAX = 640;
const TILE_GAP = 12;

const typeLabel = (type: ContentType) => type.toLowerCase() as StringKey;

// Browse by category, then by god: pick what you want (wallpapers, bhajans…)
// here; the next screen asks for the god. Nothing is listed by name here.
export function ExploreScreen({ navigation, route }: Props) {
  const { t } = useApp();
  const requested = route.params?.category;
  const window = useWindowDimensions();
  const width = Math.min(window.width, PAGE_MAX) - PAGE_PADDING;
  const choose = (type: ContentType) =>
    navigation.navigate("ChooseDeity", { type, source: "explore" });
  // Links that name a category skip straight to its gods.
  useEffect(() => {
    if (!contentTypes.includes(requested as ContentType)) return;
    navigation.setParams({ category: undefined });
    choose(requested as ContentType);
    // `choose` only wraps `navigation`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, navigation]);
  return (
    <Page title={t("explore")} subtitle={t("discover")}>
      <Txt bold size={22}>
        {t("chooseCategory")}
      </Txt>
      <View style={styles.tiles}>
        {categories.map((type) => (
          <CategoryTile
            key={type}
            type={type}
            width={Math.floor((width - TILE_GAP) / 2)}
            onPress={() => choose(type)}
          />
        ))}
      </View>
    </Page>
  );
}

function CategoryTile({
  type,
  width,
  onPress,
}: {
  type: ContentType;
  width: number;
  onPress: () => void;
}) {
  const { t } = useApp();
  const Icon = contentTypeIcons[type];
  const label = t(typeLabel(type));
  return (
    <Pressable
      testID={`category-${type}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.tileIcon}>
        <Icon size={34} color={colors.primary} />
      </View>
      <View style={styles.tileLabel}>
        <Txt
          bold
          size={19}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={styles.tileText}
        >
          {label}
        </Txt>
        <ChevronRight size={20} color={sanctum.brass} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  // A brass-edged tile like a decorated thali; the whole tile opens the gods.
  tile: {
    minHeight: 132,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: sanctum.brassLight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  tileIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileText: { textAlign: "center", color: colors.ink, flexShrink: 1 },
  pressed: { opacity: 0.72 },
});
