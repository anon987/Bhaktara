import React, { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, View } from "react-native";
import {
  ChevronRight,
  Flame,
  Flower2,
  LucideIcon,
  Sparkles,
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
import { useStats } from "../sadhana/SadhanaParts";
import { rankNames } from "../../domain/progression";
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
import { contentTypeIcons } from "../../components/contentTypeIcons";
import { colors } from "../../theme/tokens";
import { localPracticeDay } from "../../domain/practice";
import { Banner, CatalogMode } from "../../domain/models";
import { HomeFeed, HomeSection, HomeTarget } from "../../domain/home";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Home">,
  NativeStackScreenProps<RootParams>
>;
type Navigation = Props["navigation"];
// CMS shortcuts name an icon key; unknown keys fall back to a neutral icon.
const shortcutIcons: Record<string, LucideIcon> = {
  ...Object.fromEntries(
    Object.entries(contentTypeIcons).map(([type, icon]) => [
      type.toLowerCase(),
      icon,
    ]),
  ),
  mandir: Flower2,
};
function openTarget(navigation: Navigation, target: HomeTarget) {
  if (target.route === "mandir") navigation.navigate("Mandir");
  else if (target.route === "sadhana") navigation.navigate("Sadhana");
  else
    navigation.navigate(
      "Explore",
      target.params ? { category: target.params.category } : undefined,
    );
}
// One read of the precomputed feed for the current language. Results are
// keyed by language and attempt, so a late response never shows stale data.
function useHomeFeed() {
  const { getHome, local } = useApp();
  const [attempt, setAttempt] = useState(0);
  const key = `${local.language}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    feed: HomeFeed | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    let active = true;
    getHome(local.language)
      .then((feed) => {
        if (active) setResult({ key, feed, error: false });
      })
      .catch(() => {
        if (active) setResult({ key, feed: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [getHome, key, local.language]);
  const current = result?.key === key ? result : null;
  const feed = current?.feed ?? null;
  const mode: CatalogMode = !current
    ? "loading"
    : current.error
      ? "error"
      : !feed || (!feed.banners.length && !feed.sections.length)
        ? "empty"
        : "ready";
  return { mode, feed, retry: () => setAttempt((value) => value + 1) };
}
export function HomeScreen({ navigation }: Props) {
  const { t } = useApp();
  return (
    <Page title={`${t("greeting")} 🙏`} subtitle={t("homeSubtitle")}>
      <DataBoundary>
        <HomeFeedView navigation={navigation} />
      </DataBoundary>
    </Page>
  );
}
function HomeFeedView({ navigation }: { navigation: Navigation }) {
  const { t } = useApp();
  const { mode, feed, retry } = useHomeFeed();
  return (
    <DataBoundary mode={mode} onRetry={retry} emptyText="homeEmpty">
      {feed && (
        <>
          {/* Banners are always first (D-030); they are not an orderable section. */}
          {feed.banners.length > 0 && (
            <BannerCarousel banners={feed.banners} navigation={navigation} />
          )}
          {feed.sections.map((section) => (
            <View
              key={section.id}
              testID={`home-section-${section.id}`}
              style={{ gap: 20 }}
            >
              <HomeSectionView section={section} navigation={navigation} />
            </View>
          ))}
          <Txt size={11} muted style={{ textAlign: "center" }}>
            {t("demo")}
          </Txt>
        </>
      )}
    </DataBoundary>
  );
}
function HomeSectionView({
  section,
  navigation,
}: {
  section: HomeSection;
  navigation: Navigation;
}) {
  const { local, t } = useApp();
  const stats = useStats();
  const language = local.language;
  switch (section.type) {
    case "PROGRESS":
      return (
        <Card style={{ padding: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            {[
              {
                icon: Flame,
                value: `${stats.currentStreak}`,
                label: t("streak"),
              },
              {
                icon: Sparkles,
                value: `${stats.totalXp}`,
                label: t("points"),
              },
              {
                icon: Flower2,
                value: stats.real ? rankNames[stats.rank][language] : t("rank"),
                label: `${t("level")} ${stats.level}`,
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
          {!stats.real && (
            <Txt size={10} muted style={{ textAlign: "center" }}>
              {t("sample")}
            </Txt>
          )}
        </Card>
      );
    case "SHORTCUTS":
      return (
        <>
          <Section title={section.title?.[language] ?? t("quick")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 20 }}>
            {section.items.map((item, index) => {
              const Icon = shortcutIcons[item.iconKey] ?? Sparkles;
              return (
                <Pressable
                  key={`${item.iconKey}-${index}`}
                  accessibilityRole="button"
                  onPress={() => openTarget(navigation, item.target)}
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
                    {item.label[language]}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    case "SADHANA":
      return (
        <>
          <Section title={section.title?.[language] ?? t("daily")} />
          <SadhanaCard onPress={() => navigation.navigate("Sadhana")} />
        </>
      );
    case "RAIL": {
      const category = section.source?.contentType;
      return (
        <>
          <Section
            title={section.title[language]}
            action={t("viewAll")}
            onPress={() =>
              navigation.navigate(
                "Explore",
                category ? { category } : undefined,
              )
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 16 }}
          >
            {section.items.map((item) => (
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
        </>
      );
    }
    case "QUOTE":
      return (
        <Card
          style={{ backgroundColor: colors.pale, borderColor: colors.pale }}
        >
          {section.title && <Txt bold>{section.title[language]}</Txt>}
          <Txt bold size={18} style={{ color: colors.dark }}>
            “{section.text[language]}”
          </Txt>
          {section.attribution && (
            <Txt size={12} muted>
              — {section.attribution[language]}
            </Txt>
          )}
        </Card>
      );
    default:
      // Section types this app version does not know are skipped.
      return null;
  }
}
function SadhanaCard({ onPress }: { onPress: () => void }) {
  const { local, t } = useApp();
  const done = Object.values(local.days[localPracticeDay()] ?? {}).filter(
    Boolean,
  ).length;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
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
  );
}
function BannerCarousel({
  banners,
  navigation,
}: {
  banners: Banner[];
  navigation: Navigation;
}) {
  const { local } = useApp();
  const [bannerIndex, setBannerIndex] = useState(0);
  const [width, setWidth] = useState(330);
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setBannerIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {banners.map((banner) => (
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
        {banners.map((banner, index) => (
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
  );
}
