import React, { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { ChevronRight, Sparkles } from "lucide-react-native";
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
  DataBoundary,
  Page,
  Progress,
  Row,
  Section,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { ContentCard } from "../../components/ContentCard";
import { categoryArt } from "../../components/categoryArt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { backgrounds } from "../../components/backgrounds";
import { resolveMediaUrl } from "../../services/media/config";
import { colors, sanctum, shrine } from "../../theme/tokens";
import { localPracticeDay } from "../../domain/practice";
import { Banner, CatalogMode, contentTypes } from "../../domain/models";
import { HomeFeed, HomeSection, HomeTarget } from "../../domain/home";
import { DarshanKey, darshanFor, greetingFor } from "../../domain/darshan";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Home">,
  NativeStackScreenProps<RootParams>
>;
type Navigation = Props["navigation"];
// 3D art (made with Gemini on Vertex). CMS shortcuts name an icon key: a
// content type in lower case or "mandir"; unknown keys fall back to an icon.
const shortcutArt: Record<string, ImageSourcePropType> = {
  ...Object.fromEntries(
    contentTypes.map((type) => [type.toLowerCase(), categoryArt[type]]),
  ),
  mandir: require("../../../assets/home/mandir.webp"),
};
const art = {
  toran: require("../../../assets/home/toran.webp"),
  diya: require("../../../assets/home/diya.webp"),
  lotus: require("../../../assets/home/lotus.webp"),
  kalash: require("../../../assets/home/kalash.webp"),
  mala: require("../../../assets/home/mala.webp"),
};
// By the tab a banner opens (its target is CMS data, validated there).
const bannerArt: Record<string, ImageSourcePropType> = {
  Mandir: shortcutArt.mandir,
  Sadhana: art.mala,
  Explore: art.lotus,
};
const darshanArt: Record<DarshanKey, ImageSourcePropType> = {
  sun: require("../../../assets/home/darshan-sun.webp"),
  mon: require("../../../assets/home/darshan-mon.webp"),
  tue: require("../../../assets/home/darshan-tue.webp"),
  wed: require("../../../assets/home/darshan-wed.webp"),
  thu: require("../../../assets/home/darshan-thu.webp"),
  fri: require("../../../assets/home/darshan-fri.webp"),
  sat: require("../../../assets/home/darshan-sat.webp"),
};
function openTarget(navigation: Navigation, target: HomeTarget) {
  if (target.route === "mandir") navigation.navigate("Mandir");
  else if (target.route === "sadhana") navigation.navigate("Sadhana");
  // A category goes straight to choosing the god (Explore's second step).
  else if (target.params)
    navigation.navigate("ChooseDeity", {
      type: target.params.category,
      source: "explore",
    });
  else navigation.navigate("Explore");
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
    <Page title={t("home")} header={<Greeting />} background={backgrounds.home}>
      <DarshanHero onPress={() => navigation.navigate("Mandir")} />
      <DataBoundary>
        <HomeFeedView navigation={navigation} />
      </DataBoundary>
    </Page>
  );
}
// The greeting for the hour on a saffron band, a marigold toran hanging below.
function Greeting() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const now = new Date();
  return (
    <View style={styles.greeting}>
      <LinearGradient
        colors={[colors.bhagwa, colors.saffron, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.greetingBand, { paddingTop: insets.top + 14 }]}
      >
        <Txt
          bold
          size={30}
          accessibilityRole="header"
          style={{ color: colors.white }}
        >
          {`${t(greetingFor(now))} 🙏`}
        </Txt>
        <Txt size={15} style={{ color: colors.headerText }}>
          {t("homeSubtitle")}
        </Txt>
      </LinearGradient>
      <Image
        source={art.toran}
        style={styles.toran}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}
// Today's deity, painted large; the whole card opens the Mandir to light a diya.
function DarshanHero({ onPress }: { onPress: () => void }) {
  const { local, t } = useApp();
  const language = local.language;
  const today = darshanFor(new Date());
  const deity = today.deity[language];
  const day = language === "hi" ? `${deity} का दिन` : `${deity}’s day`;
  return (
    <Pressable
      testID="darshan-hero"
      accessibilityRole="button"
      accessibilityLabel={`${t("todaysDarshan")}: ${deity}. ${t("lightDiya")}`}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      <Image
        source={darshanArt[today.key]}
        style={styles.heroImage}
        resizeMode="cover"
        accessible={false}
      />
      <LinearGradient
        colors={["#1E110D00", "#1E110D99", "#1E110DEE"]}
        locations={[0.42, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroText}>
        <Txt bold size={14} style={{ color: sanctum.brassLight }}>
          {t("todaysDarshan")}
        </Txt>
        <Txt bold size={30} style={{ color: sanctum.text }}>
          {deity}
        </Txt>
        <Txt size={15} style={{ color: sanctum.textMuted }}>
          {`${today.weekday[language]} · ${day}`}
        </Txt>
        <View style={styles.heroCta}>
          <Image source={art.diya} style={{ width: 34, height: 34 }} />
          <Txt bold size={17} style={{ color: colors.white }}>
            {t("lightDiya")}
          </Txt>
          <ChevronRight size={20} color={colors.white} />
        </View>
      </View>
    </Pressable>
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
              style={{ gap: 16 }}
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
        <View>
          <Row style={{ gap: 10 }}>
            {[
              {
                image: art.diya,
                value: `${stats.currentStreak}`,
                label: t("streak"),
              },
              {
                image: art.lotus,
                value: `${stats.totalXp}`,
                label: t("points"),
              },
              {
                image: art.kalash,
                value: stats.real ? rankNames[stats.rank][language] : t("rank"),
                label: `${t("level")} ${stats.level}`,
              },
            ].map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Image source={stat.image} style={{ width: 44, height: 44 }} />
                <Txt
                  bold
                  size={19}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: shrine.maroon }}
                >
                  {stat.value}
                </Txt>
                <Txt size={13} muted numberOfLines={1} adjustsFontSizeToFit>
                  {stat.label}
                </Txt>
              </View>
            ))}
          </Row>
          {!stats.real && (
            <Txt size={11} muted style={{ textAlign: "center", marginTop: 6 }}>
              {t("sample")}
            </Txt>
          )}
        </View>
      );
    case "SHORTCUTS":
      return (
        <>
          <Section title={section.title?.[language] ?? t("quick")} />
          <View style={styles.shortcuts}>
            {section.items.map((item, index) => {
              const image = shortcutArt[item.iconKey];
              return (
                <Pressable
                  key={`${item.iconKey}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.label[language]}
                  onPress={() => openTarget(navigation, item.target)}
                  style={({ pressed }) => [
                    styles.shortcut,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.shortcutTile}>
                    {image ? (
                      <Image source={image} style={{ width: 54, height: 54 }} />
                    ) : (
                      <Sparkles size={30} color={colors.primary} />
                    )}
                  </View>
                  <Txt
                    bold
                    size={14}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ textAlign: "center" }}
                  >
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
        <View style={styles.quote}>
          <Image source={art.lotus} style={{ width: 48, height: 48 }} />
          {section.title && (
            <Txt bold style={{ color: shrine.goldDeep }}>
              {section.title[language]}
            </Txt>
          )}
          <Txt
            bold
            size={20}
            style={{ color: shrine.maroon, textAlign: "center" }}
          >
            “{section.text[language]}”
          </Txt>
          {section.attribution && (
            <Txt size={13} muted>
              — {section.attribution[language]}
            </Txt>
          )}
        </View>
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
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sadhana, pressed && styles.pressed]}
    >
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt bold size={19} style={{ color: shrine.maroon }}>
            {t("dailyHint")}
          </Txt>
          <Txt muted size={14}>
            {done}/3 {t("tasks")}
          </Txt>
        </View>
        <Image source={art.mala} style={{ width: 84, height: 84 }} />
      </Row>
      <Progress value={done / 3} label={t("daily")} />
      <View style={styles.sadhanaCta}>
        <Txt bold size={16} style={{ color: colors.white }}>
          {t("startPractice")}
        </Txt>
        <ChevronRight size={20} color={colors.white} />
      </View>
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
            style={({ pressed }) => [
              styles.banner,
              { width },
              pressed && styles.pressed,
            ]}
          >
            {/* Uploaded banner art on the right; without it, 3D art for where
                the banner leads. */}
            {resolveMediaUrl(banner.artKey) ? (
              <>
                <View style={styles.bannerArt}>
                  <DevotionalArt assetKey={banner.artKey} size={300} />
                </View>
                <LinearGradient
                  colors={[shrine.parchment, shrine.parchment, "#FBF1DF00"]}
                  locations={[0, 0.43, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <Image
                source={
                  bannerArt[resolveBannerTarget(banner.target)] ?? art.lotus
                }
                style={styles.bannerIcon}
                accessible={false}
              />
            )}
            <View style={{ padding: 22, width: "68%", gap: 10 }}>
              <Txt bold size={24} style={{ color: shrine.maroon }}>
                {banner.title[local.language]}
              </Txt>
              <Txt size={15} style={{ color: shrine.ink }}>
                {banner.subtitle[local.language]}
              </Txt>
              <Row style={{ gap: 2 }}>
                <Txt
                  size={15}
                  bold
                  style={{ color: colors.primary, flexShrink: 1 }}
                >
                  {banner.cta[local.language]}
                </Txt>
                <ChevronRight size={18} color={colors.primary} />
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

const styles = StyleSheet.create({
  greeting: { marginBottom: 4 },
  greetingBand: {
    paddingHorizontal: 22,
    paddingBottom: 30,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    borderBottomWidth: 3,
    borderColor: colors.haldi,
  },
  // The toran is 1080 x 217: full width, hanging from the top edge.
  toran: {
    width: "100%",
    height: undefined,
    aspectRatio: 1080 / 217,
    marginTop: -18,
  },
  hero: {
    width: "100%",
    aspectRatio: 0.8,
    borderRadius: 28,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: sanctum.night,
    borderWidth: 2,
    borderColor: shrine.goldLight,
  },
  // Explicit size: a bundled image with only absoluteFill draws at its pixel size.
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  heroText: { padding: 22, gap: 2 },
  heroCta: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 26,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: sanctum.brass,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 22,
    backgroundColor: shrine.card,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  shortcuts: { flexDirection: "row", flexWrap: "wrap", rowGap: 16 },
  shortcut: {
    width: "25%",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 3,
  },
  shortcutTile: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  sadhana: {
    padding: 20,
    gap: 14,
    borderRadius: 24,
    backgroundColor: shrine.card,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  sadhanaCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  quote: {
    alignItems: "center",
    gap: 8,
    padding: 22,
    borderRadius: 24,
    backgroundColor: shrine.parchment,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  banner: {
    minHeight: 200,
    justifyContent: "center",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: shrine.parchment,
    borderWidth: 1.5,
    borderColor: shrine.line,
  },
  bannerArt: {
    position: "absolute",
    right: -36,
    top: 0,
    width: "63%",
    height: "100%",
    opacity: 0.85,
  },
  bannerIcon: {
    position: "absolute",
    right: 12,
    width: 112,
    height: 112,
    alignSelf: "center",
  },
  pressed: { opacity: 0.8 },
});
