import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Flower2 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
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
import { ContentType, Deity } from "../../domain/models";
import { StringKey } from "../../i18n/strings";
import { colors } from "../../theme/tokens";
import { DeityCircle } from "./DeityCircle";
import { useDeitiesWithContent } from "./useDeityContent";

type Props = NativeStackScreenProps<RootParams, "ChooseDeity">;

// Page padding (22 each side) and the widest page (ui.tsx Page).
const PAGE_PADDING = 44;
const PAGE_MAX = 640;
const DEITY_GAP = 14;

// The second step of Explore: the category is chosen, now pick a god to see
// only theirs.
export function ChooseDeityScreen({ navigation, route }: Props) {
  const { t } = useApp();
  const { type } = route.params;
  const source = route.params.source ?? "explore";
  const window = useWindowDimensions();
  const width = Math.min(window.width, PAGE_MAX) - PAGE_PADDING;
  return (
    <Page title={t(type.toLowerCase() as StringKey)} onBack={navigation.goBack}>
      <DataBoundary>
        <DeityGrid
          type={type}
          width={width}
          onOpen={(deity) =>
            navigation.navigate("DeityContent", {
              deityId: deity.id,
              type,
              source,
            })
          }
        />
      </DataBoundary>
    </Page>
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
  const Icon = contentTypeIcons[type];
  return (
    <View style={{ gap: 16 }}>
      <Row>
        <Icon size={24} color={colors.gold} />
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
  deities: { flexDirection: "row", flexWrap: "wrap", gap: DEITY_GAP },
  deity: { alignItems: "center", gap: 8, paddingVertical: 4 },
  empty: { alignItems: "center", paddingVertical: 28 },
  pressed: { opacity: 0.72 },
});
