import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Flower2 } from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  DataBoundary,
  Page,
  Row,
  Txt,
} from "../../components/ui";
import { contentTypeIcons } from "../../components/contentTypeIcons";
import { ContentType, contentTypes, Deity } from "../../domain/models";
import { StringKey } from "../../i18n/strings";
import { colors, sanctum } from "../../theme/tokens";
import { DeityCircle } from "./DeityCircle";
import { useDeitiesWithContent } from "./useDeityContent";

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
const DEFAULT_CATEGORY: ContentType = "WALLPAPER";
// Page padding (22 each side) and the widest page (ui.tsx Page).
const PAGE_PADDING = 44;
const PAGE_MAX = 640;
const TILE_GAP = 10;
const DEITY_GAP = 14;

const typeLabel = (type: ContentType) => type.toLowerCase() as StringKey;

// Browse by category, then by god: pick what you want (wallpapers, bhajans…),
// then tap a god to see only theirs. Nothing is listed by name here.
export function ExploreScreen({ navigation, route }: Props) {
  const { t } = useApp();
  const requested = route.params?.category;
  // Home's "daily companions" tiles open Explore on a category.
  const category = contentTypes.includes(requested as ContentType)
    ? (requested as ContentType)
    : DEFAULT_CATEGORY;
  const window = useWindowDimensions();
  const width = Math.min(window.width, PAGE_MAX) - PAGE_PADDING;
  return (
    <Page title={t("explore")} subtitle={t("discover")}>
      <DataBoundary>
        <Txt bold size={20}>
          {t("chooseCategory")}
        </Txt>
        <View style={styles.tiles}>
          {categories.map((type) => (
            <CategoryTile
              key={type}
              type={type}
              width={Math.floor((width - 3 * TILE_GAP) / 4)}
              selected={type === category}
              onPress={() => navigation.setParams({ category: type })}
            />
          ))}
        </View>
        <DeityGrid
          type={category}
          width={width}
          onOpen={(deity) =>
            navigation.navigate("DeityContent", {
              deityId: deity.id,
              type: category,
              source: "explore",
            })
          }
        />
      </DataBoundary>
    </Page>
  );
}

function CategoryTile({
  type,
  width,
  selected,
  onPress,
}: {
  type: ContentType;
  width: number;
  selected: boolean;
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
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width },
        selected && styles.tileSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.tileIcon, selected && styles.tileIconSelected]}>
        <Icon size={26} color={selected ? colors.white : colors.primary} />
      </View>
      <Txt
        bold
        size={14}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.tileText, selected && { color: colors.white }]}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

// Only the gods with at least one published item of the chosen category,
// three to a row: a round picture with the name below.
function DeityGrid({
  type,
  width,
  onOpen,
}: {
  type: ContentType;
  width: number;
  onOpen: (deity: Deity) => void;
}) {
  const { catalog, local, t } = useApp();
  const { ids, pending, failed, retry } = useDeitiesWithContent(type);
  const deities = (catalog?.deities ?? []).filter((deity) =>
    ids.includes(deity.id),
  );
  const cell = Math.floor((width - 2 * DEITY_GAP) / 3);
  const circle = Math.min(cell - 4, 128);
  return (
    <View style={{ gap: 16 }}>
      <Row style={{ marginTop: 6 }}>
        <Flower2 size={24} color={colors.gold} />
        <Txt bold size={22} style={{ flex: 1 }}>
          {t("chooseGod")}
        </Txt>
      </Row>
      {deities.length > 0 && (
        <View style={styles.deities} testID={`deities-${type}`}>
          {deities.map((deity) => (
            <Pressable
              key={deity.id}
              testID={`deity-${deity.id}`}
              accessibilityRole="button"
              accessibilityLabel={deity.name[local.language]}
              onPress={() => onOpen(deity)}
              style={({ pressed }) => [
                styles.deity,
                { width: cell },
                pressed && styles.pressed,
              ]}
            >
              <DeityCircle deity={deity} size={circle} />
              <Txt
                bold
                size={17}
                numberOfLines={2}
                style={{ textAlign: "center" }}
              >
                {deity.name[local.language]}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
      {pending && (
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel={t("loading")}
        />
      )}
      {failed && (
        <Card style={{ alignItems: "center" }}>
          <Txt bold>{t("error")}</Txt>
          <Button label={t("retry")} onPress={retry} />
        </Card>
      )}
      {!pending && !failed && deities.length === 0 && (
        <Card style={styles.empty}>
          <Flower2 size={40} color={colors.gold} />
          <Txt bold size={18} style={{ textAlign: "center" }}>
            {t("noDeitiesForType")}
          </Txt>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  tile: {
    minHeight: 100,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  // Chosen: a kumkum-red tile edged in brass, like a decorated thali.
  tileSelected: {
    backgroundColor: colors.primary,
    borderColor: sanctum.brass,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  tileIconSelected: { backgroundColor: "rgba(255,255,255,0.18)" },
  tileText: { textAlign: "center", color: colors.ink },
  deities: { flexDirection: "row", flexWrap: "wrap", gap: DEITY_GAP },
  deity: { alignItems: "center", gap: 8, paddingVertical: 4 },
  empty: { alignItems: "center", paddingVertical: 28 },
  pressed: { opacity: 0.72 },
});
