import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Search } from "lucide-react-native";
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
  Page,
  Row,
  Section,
  Txt,
} from "../../components/ui";
import { ContentCard } from "../../components/ContentCard";
import { colors, fonts } from "../../theme/tokens";
import { Content, ContentType, contentTypes } from "../../domain/models";
import { mockContentRepository } from "../../repositories/mockRepository";
import { StringKey } from "../../i18n/strings";
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Explore">,
  NativeStackScreenProps<RootParams>
>;
export function ExploreScreen({ navigation, route }: Props) {
  const { local, t, catalog } = useApp();
  const [query, setQuery] = useState("");
  const category = route.params?.category;
  const type = contentTypes.includes(category as ContentType)
    ? (category as ContentType)
    : undefined;
  const setType = (value: ContentType | undefined) =>
    navigation.setParams({ category: value });
  const [deity, setDeity] = useState<string>();
  const [items, setItems] = useState<Content[]>([]);
  const [nextOffset, setNextOffset] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(false);
      mockContentRepository
        .search({ query, type, deityId: deity })
        .then((result) => {
          if (active) {
            setItems(result.items);
            setNextOffset(result.nextOffset);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(true);
            setLoading(false);
          }
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, type, deity, reload]);
  const more = () => {
    setLoading(true);
    mockContentRepository
      .search({ query, type, deityId: deity, offset: nextOffset })
      .then((result) => {
        setItems((previous) => [...previous, ...result.items]);
        setNextOffset(result.nextOffset);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  const header = (
    <View style={{ gap: 18 }}>
      <Row
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 18,
          paddingHorizontal: 16,
        }}
      >
        <Search size={20} color={colors.muted} />
        <TextInput
          accessibilityLabel={t("search")}
          placeholder={t("search")}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          style={{
            flex: 1,
            minHeight: 56,
            fontSize: 14,
            color: colors.ink,
            fontFamily: local.language === "hi" ? fonts.hi : fonts.en,
          }}
        />
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label={t("all")}
          selected={!type}
          onPress={() => setType(undefined)}
        />
        {contentTypes.map((value) => (
          <Chip
            key={value}
            label={t(value.toLowerCase() as StringKey)}
            selected={type === value}
            onPress={() => setType(value)}
          />
        ))}
      </ScrollView>
      <Section title={t("browseDeity")} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label={t("all")}
          selected={!deity}
          onPress={() => setDeity(undefined)}
        />
        {catalog?.deities.map((item) => (
          <Chip
            key={item.id}
            label={item.name[local.language]}
            selected={deity === item.id}
            onPress={() => setDeity(item.id)}
          />
        ))}
      </ScrollView>
      <Section title={query ? t("results") : t("library")} />
      {error && (
        <Card>
          <Txt>{t("error")}</Txt>
          <Button
            label={t("retry")}
            onPress={() => setReload((value) => value + 1)}
          />
        </Card>
      )}
    </View>
  );
  return (
    <Page title={t("explore")} subtitle={t("discover")} scroll={false}>
      <DataBoundary>
        <FlatList
          style={{ flexGrow: 0 }}
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ContentCard
              compact
              item={item}
              onPress={() =>
                navigation.navigate("Content", { contentId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            !loading && !error ? (
              <Card>
                <Txt bold>{t("noResults")}</Txt>
                <Txt muted>{t("noResultsHint")}</Txt>
                <Button
                  secondary
                  label={t("clear")}
                  onPress={() => {
                    setQuery("");
                    setType(undefined);
                    setDeity(undefined);
                  }}
                />
              </Card>
            ) : null
          }
          ListFooterComponent={
            <View style={{ paddingVertical: 24, gap: 16 }}>
              {loading && <ActivityIndicator color={colors.primary} />}
              {nextOffset !== undefined && !loading && (
                <Button secondary label={t("loadMore")} onPress={more} />
              )}
              <Txt size={11} muted>
                {t("demo")}
              </Txt>
            </View>
          }
        />
      </DataBoundary>
    </Page>
  );
}
