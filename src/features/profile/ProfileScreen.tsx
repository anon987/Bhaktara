import { useDialog } from "../../components/Dialog";
import React from "react";
import { Pressable, View } from "react-native";
import {
  Award,
  Bell,
  ChevronRight,
  Flame,
  Flower2,
  Info,
  Languages,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
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
  Section,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { FavoriteList } from "./FavoriteList";
import { colors } from "../../theme/tokens";
import { CatalogMode } from "../../domain/models";
import { platformServices } from "../../services/platform";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Profile">,
  NativeStackScreenProps<RootParams>
>;
export function ProfileScreen({ navigation }: Props) {
  const { t, local, catalog, setLanguage, setCatalogMode, connection } =
    useApp();
  const unavailable = useUnavailable();
  const showDialog = useDialog();
  return (
    <Page title={t("profile")}>
      <DataBoundary>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View
            style={{
              padding: 24,
              backgroundColor: colors.pale,
              borderRadius: 60,
              borderWidth: 1,
              borderColor: colors.gold,
            }}
          >
            <Flower2 color={colors.primary} size={42} />
          </View>
          <Txt bold size={24}>
            {t("guest")}
          </Txt>
          <Txt muted size={12}>
            {t(
              connection === "emulator" || connection === "cloud"
                ? "emulatorGuest"
                : "guestLabel",
            )}
          </Txt>
          <Chip
            label={`${t("rank")} · ${t("level")} ${catalog?.sampleStats.level}`}
            onPress={() => showDialog(t("rank"), t("rankInfo"))}
          />
        </View>
        <Card>
          <Row style={{ justifyContent: "space-around" }}>
            <View style={{ alignItems: "center", gap: 5 }}>
              <Sparkles size={23} color={colors.gold} />
              <Txt bold size={24}>
                {catalog?.sampleStats.totalXp} XP
              </Txt>
            </View>
            <View style={{ alignItems: "center", gap: 5 }}>
              <Flame size={23} color={colors.primary} />
              <Txt bold size={24}>
                {catalog?.sampleStats.currentStreak}
              </Txt>
              <Txt muted size={12}>
                {t("streak")}
              </Txt>
            </View>
          </Row>
          <Txt muted size={11} style={{ textAlign: "center" }}>
            {t("sample")}
          </Txt>
        </Card>
        <Button
          secondary
          label={t("signIn")}
          onPress={() => unavailable("authUnavailable")}
        />
        <Section title={t("badges")} />
        <Row>
          {[
            { icon: Flower2, en: "First Sadhana", hi: "पहली साधना" },
            { icon: Flame, en: "7-day streak", hi: "7 दिन की स्ट्रीक" },
            { icon: Award, en: "First mala", hi: "पहली माला" },
          ].map(({ icon: Icon, en, hi }) => (
            <Card
              key={en}
              style={{
                flex: 1,
                padding: 10,
                alignItems: "center",
                minHeight: 132,
              }}
            >
              <Icon size={31} color={colors.gold} />
              <Txt size={11} bold style={{ textAlign: "center" }}>
                {local.language === "en" ? en : hi}
              </Txt>
              <Txt muted size={10}>
                {t("preview")}
              </Txt>
            </Card>
          ))}
        </Row>
        <Section title={t("favorites")} />
        <FavoriteList
          key={connection}
          onSelect={(id) =>
            navigation.navigate("Content", {
              contentId: id,
              source: "favorites",
            })
          }
        />
      </DataBoundary>
      <Section title={t("settings")} />
      <Card>
        <Row>
          <Languages size={22} color={colors.primary} />
          <Txt bold style={{ flex: 1 }}>
            {t("language")}
          </Txt>
          <Chip
            label={local.language === "hi" ? "English" : "हिन्दी"}
            onPress={() => setLanguage(local.language === "hi" ? "en" : "hi")}
          />
        </Row>
        {[
          {
            key: "notifications",
            icon: Bell,
            action: () => {
              void platformServices.notifications.request();
              unavailable("notificationUnavailable");
            },
          },
          {
            key: "privacy",
            icon: ShieldCheck,
            action: () =>
              showDialog(
                t("privacy"),
                t(
                  connection === "emulator"
                    ? "emulatorPrivacy"
                    : connection === "cloud"
                      ? "cloudPrivacy"
                      : "privacyText",
                ),
              ),
          },
          {
            key: "about",
            icon: Info,
            action: () => showDialog(t("about"), t("aboutText")),
          },
        ].map(({ key, icon: Icon, action }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={action}
            style={{ minHeight: 56 }}
          >
            <Row style={{ paddingVertical: 12 }}>
              <Icon size={22} color={colors.primary} />
              <Txt style={{ flex: 1 }}>{t(key as "about")}</Txt>
              <ChevronRight size={20} color={colors.muted} />
            </Row>
          </Pressable>
        ))}
      </Card>
      <Notice text={t("localOnly")} />
      {__DEV__ && (
        <Card>
          <Txt bold size={12}>
            Developer preview states
          </Txt>
          <Row style={{ flexWrap: "wrap" }}>
            {(
              ["ready", "loading", "empty", "error", "offline"] as CatalogMode[]
            ).map((mode) => (
              <Chip
                key={mode}
                label={mode}
                onPress={() => setCatalogMode(mode)}
              />
            ))}
          </Row>
        </Card>
      )}
      <Txt muted size={11} style={{ textAlign: "center" }}>
        Bhaktara · 0.1.0
      </Txt>
    </Page>
  );
}
