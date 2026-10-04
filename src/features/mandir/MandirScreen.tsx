import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Bell, Flame, Flower2, Music2 } from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams, TabParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  Chip,
  DataBoundary,
  Notice,
  Page,
  Row,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { StringKey } from "../../i18n/strings";
import { usePlayer } from "../player/PlayerProvider";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Mandir">,
  NativeStackScreenProps<RootParams>
>;
export function MandirScreen({ navigation }: Props) {
  const { local, catalog, t, update, searchContent } = useApp();
  const player = usePlayer();
  const unavailable = useUnavailable();
  const [choosing, setChoosing] = useState(!local.deityId);
  const [lit, setLit] = useState(false);
  const [flowers, setFlowers] = useState(0);
  const [feedback, setFeedback] = useState<StringKey>();
  const deity = catalog?.deities.find((item) => item.id === local.deityId);
  return (
    <Page
      title={t("mandir")}
      subtitle={
        feedback
          ? `${t(feedback)}${feedback === "flowersOffered" ? ` · ${flowers}` : ""}`
          : t("sacredSpace")
      }
    >
      <DataBoundary>
        {choosing || !deity ? (
          <>
            <Txt bold size={24}>
              {t("chooseDeity")}
            </Txt>
            <Txt muted>{t("deityHint")}</Txt>
            {catalog?.deities.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => {
                  update((state) => ({ ...state, deityId: item.id }));
                  setChoosing(false);
                  setLit(false);
                  setFlowers(0);
                  setFeedback(undefined);
                }}
              >
                <Card>
                  <Row>
                    <View style={{ width: 72 }}>
                      <DevotionalArt assetKey={item.artKey} size={76} />
                    </View>
                    <Txt bold size={20}>
                      {item.name[local.language]}
                    </Txt>
                  </Row>
                </Card>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={23}>
                {deity.name[local.language]}
              </Txt>
              <Chip label={t("change")} onPress={() => setChoosing(true)} />
            </Row>
            <DevotionalArt assetKey={deity.artKey} size={310} lit={lit} />
            <Txt muted size={11} style={{ textAlign: "center" }}>
              {t("placeholder")}
            </Txt>
            <Txt bold style={{ textAlign: "center" }}>
              {t("freeOfferings")}
            </Txt>
            <Row style={{ alignItems: "stretch" }}>
              {[
                {
                  key: "diya",
                  icon: Flame,
                  action: () => {
                    setLit(true);
                    setFeedback("diyaLit");
                  },
                },
                {
                  key: "flowers",
                  icon: Flower2,
                  action: () => {
                    setFlowers((value) => value + 1);
                    setFeedback("flowersOffered");
                  },
                },
                {
                  key: "bell",
                  icon: Bell,
                  action: () => setFeedback("bellRung"),
                },
              ].map(({ key, icon: Icon, action }) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={action}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 105,
                    padding: 10,
                    gap: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: colors.pale,
                    borderRadius: 18,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Icon size={27} color={colors.primary} />
                  <Txt size={12} bold style={{ textAlign: "center" }}>
                    {t(key as StringKey)}
                  </Txt>
                </Pressable>
              ))}
            </Row>
            <View accessibilityLiveRegion="polite" style={{ minHeight: 28 }}>
              <Txt size={13} muted style={{ textAlign: "center" }}>
                {feedback ? t(feedback) : " "}
                {feedback === "flowersOffered" ? ` · ${flowers}` : ""}
              </Txt>
            </View>
            <Button
              secondary
              icon={Music2}
              label={t("aarti")}
              onPress={() => {
                searchContent({ type: "AARTI", deityId: deity.id, limit: 1 })
                  .then(({ items }) => {
                    if (!items[0]) return unavailable("noResultsHint");
                    player.load(items[0], "mandir");
                    navigation.navigate("Player");
                  })
                  .catch(() => unavailable("error"));
              }}
            />
            <View style={{ height: 20 }} />
            <Card>
              <Flower2 size={25} color={colors.gold} />
              <Txt bold size={20}>
                {t("special")}
              </Txt>
              <Txt muted>{t("specialHint")}</Txt>
              <Button
                label={t("watchOffer")}
                onPress={() => unavailable("adsUnavailable")}
              />
            </Card>
          </>
        )}
        <Notice text={t("localOnly")} />
      </DataBoundary>
    </Page>
  );
}
