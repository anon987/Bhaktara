import React, { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, View } from "react-native";
import {
  AudioLines,
  Bell,
  ChevronRight,
  Flame,
  Flower2,
  Headphones,
  Image,
  Music2,
  Sparkles,
  Video,
} from "lucide-react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  RootParams,
  TabParams,
  resolveBannerTarget,
} from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Card,
  DataBoundary,
  Page,
  Progress,
  Row,
  Section,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { ContentCard } from "../../components/ContentCard";
import { colors } from "../../theme/tokens";
import { localPracticeDay } from "../../domain/practice";
import { StringKey } from "../../i18n/strings";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Home">,
  NativeStackScreenProps<RootParams>
>;
const shortcuts = [
  { key: "bhajan", icon: Headphones },
  { key: "aarti", icon: Flame },
  { key: "mantra", icon: AudioLines },
  { key: "chalisa", icon: Music2 },
  { key: "wallpaper", icon: Image },
  { key: "ringtone", icon: Bell },
  { key: "status", icon: Video },
  { key: "mandir", icon: Flower2 },
] as const;
export function HomeScreen({ navigation }: Props) {
  const { catalog, local, t } = useApp();
  const [bannerIndex, setBannerIndex] = useState(0);
  const [width, setWidth] = useState(330);
  const done = Object.values(local.days[localPracticeDay()] ?? {}).filter(
    Boolean,
  ).length;
  return (
    <Page
      title={`${t("greeting")} 🙏`}
      subtitle={t("homeSubtitle")}
      onSearch={() => navigation.navigate("Explore")}
    >
      <DataBoundary>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setBannerIndex(
                Math.round(event.nativeEvent.contentOffset.x / width),
              )
            }
          >
            {catalog?.banners.map((banner) => (
              <Pressable
                key={banner.id}
                accessibilityRole="button"
                accessibilityLabel={`${banner.title[local.language]} ${banner.cta[local.language]}`}
                onPress={() =>
                  navigation.navigate(resolveBannerTarget(banner.target))
                }
                style={{
                  width,
                  backgroundColor: colors.pale,
                  borderRadius: 24,
                  overflow: "hidden",
                  minHeight: 258,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    right: -36,
                    top: 0,
                    width: "63%",
                    height: "100%",
                    opacity: 0.85,
                  }}
                >
                  <DevotionalArt assetKey={banner.artKey} size={300} />
                </View>
                <LinearGradient
                  colors={[colors.pale, colors.pale, "#F6E8D800"]}
                  locations={[0, 0.43, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <View style={{ padding: 24, width: "75%", gap: 13 }}>
                  <Txt
                    size={10}
                    bold
                    style={{ color: colors.primary, letterSpacing: 2 }}
                  >
                    B H A K T A R A
                  </Txt>
                  <Txt bold size={27}>
                    {banner.title[local.language]}
                  </Txt>
                  <Txt size={13} style={{ maxWidth: 185 }}>
                    {banner.subtitle[local.language]}
                  </Txt>
                  <Row style={{ gap: 2, maxWidth: 200 }}>
                    <Txt
                      size={12}
                      bold
                      style={{ color: colors.primary, flexShrink: 1 }}
                    >
                      {banner.cta[local.language]}
                    </Txt>
                    <ChevronRight size={17} color={colors.primary} />
                  </Row>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Row style={{ justifyContent: "center", gap: 6, marginTop: 12 }}>
            {catalog?.banners.map((banner, index) => (
              <View
                key={banner.id}
                style={{
                  width: index === bannerIndex ? 22 : 6,
                  height: 5,
                  borderRadius: 4,
                  backgroundColor:
                    index === bannerIndex ? colors.primary : colors.line,
                }}
              />
            ))}
          </Row>
        </View>
        <Card style={{ padding: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            {[
              {
                icon: Flame,
                value: `${catalog?.sampleStats.currentStreak}`,
                label: t("streak"),
              },
              {
                icon: Sparkles,
                value: `${catalog?.sampleStats.totalXp}`,
                label: "XP",
              },
              {
                icon: Flower2,
                value: t("rank"),
                label: `${t("level")} ${catalog?.sampleStats.level}`,
              },
            ].map((stat) => (
              <View
                key={stat.label}
                style={{ flex: 1, alignItems: "center", gap: 2 }}
              >
                <stat.icon size={18} color={colors.primary} />
                <Txt bold size={17}>
                  {stat.value}
                </Txt>
                <Txt size={10} muted>
                  {stat.label}
                </Txt>
              </View>
            ))}
          </Row>
          <Txt size={10} muted style={{ textAlign: "center" }}>
            {t("sample")}
          </Txt>
        </Card>
        <Section title={t("quick")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 20 }}>
          {shortcuts.map(({ key, icon: Icon }) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() =>
                key === "mandir"
                  ? navigation.navigate("Mandir")
                  : navigation.navigate("Explore", {
                      category: key.toUpperCase(),
                    })
              }
              style={{
                width: "25%",
                alignItems: "center",
                gap: 8,
                minHeight: 76,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.pale,
                  padding: 16,
                  borderRadius: 20,
                }}
              >
                <Icon color={colors.primary} size={24} />
              </View>
              <Txt size={11} bold>
                {t(key as StringKey)}
              </Txt>
            </Pressable>
          ))}
        </View>
        <Section title={t("daily")} />
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Sadhana")}
        >
          <Card
            style={{
              backgroundColor: colors.greenPale,
              borderColor: "#DCE5D7",
            }}
          >
            <Row>
              <View style={{ flex: 1 }}>
                <Txt bold size={19}>
                  {t("dailyHint")}
                </Txt>
                <Txt muted size={12} style={{ marginTop: 8 }}>
                  {done}/3 {t("tasks")}
                </Txt>
              </View>
              <Flower2 size={36} color={colors.green} />
            </Row>
            <Progress value={done / 3} label={t("daily")} />
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={13} style={{ color: colors.green }}>
                {t("startPractice")}
              </Txt>
              <ChevronRight size={20} color={colors.green} />
            </Row>
          </Card>
        </Pressable>
        <Section
          title={t("forYou")}
          action={t("viewAll")}
          onPress={() => navigation.navigate("Explore")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16 }}
        >
          {catalog?.content.slice(0, 4).map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onPress={() =>
                navigation.navigate("Content", {
                  contentId: item.id,
                  source: "home_rail",
                })
              }
            />
          ))}
        </ScrollView>
        <Txt size={11} muted style={{ textAlign: "center" }}>
          {t("demo")}
        </Txt>
      </DataBoundary>
    </Page>
  );
}
