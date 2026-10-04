import React, { useEffect, useRef, useState } from "react";
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
import { StringKey } from "../../i18n/strings";
import { ContentQuery, ContentRepository } from "../../repositories/contracts";
// Text and deity filters are applied within each bounded server page, so a page
// can come back empty while later pages still match. Skip a few such pages.
async function searchNonEmpty(
  search: ContentRepository["search"],
  input: ContentQuery,
) {
  let result = await search(input);
  let pages = 1;
  while (!result.items.length && result.nextCursor && pages++ < 5)
    result = await search({ ...input, cursor: result.nextCursor });
  return result;
}
type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParams, "Explore">,
  NativeStackScreenProps<RootParams>
>;
export function ExploreScreen({ navigation, route }: Props) {
  const { local, t, catalog, searchContent, connection } = useApp();
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
  const [nextCursor, setNextCursor] = useState<string>();
  const generation = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  // Results (and their cursor/offset) belong to the filters that produced them.
  // During the debounce they are stale and must not be paginated or reported empty.
  const filters = JSON.stringify([query, type ?? null, deity ?? null]);
  const [resultFilters, setResultFilters] = useState<string>();
  const stale = resultFilters !== filters;
  useEffect(() => {
    let active = true;
    const requestGeneration = ++generation.current;
    if (connection === "loading" || connection === "error") return;
    const timeout = setTimeout(() => {
      setItems([]);
      setNextOffset(undefined);
      setNextCursor(undefined);
      setLoading(true);
      setError(false);
      searchNonEmpty(searchContent, { query, type, deityId: deity })
        .then((result) => {
          if (active) {
            setResultFilters(filters);
            setItems(result.items);
            setNextOffset(result.nextOffset);
            setNextCursor(result.nextCursor);
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
      generation.current = requestGeneration + 1;
      clearTimeout(timeout);
    };
  }, [query, type, deity, filters, reload, searchContent, connection]);
  const more = () => {
    if (loading || stale) return;
    const requestGeneration = generation.current;
    setLoading(true);
    searchNonEmpty(searchContent, {
      query,
      type,
      deityId: deity,
      offset: nextOffset,
      cursor: nextCursor,
    })
      .then((result) => {
        if (requestGeneration !== generation.current) return;
        setItems((previous) => [
          ...previous,
          ...result.items.filter(
            (item) => !previous.some((old) => old.id === item.id),
          ),
        ]);
        setNextOffset(result.nextOffset);
        setNextCursor(result.nextCursor);
      })
      .catch(() => {
        if (requestGeneration === generation.current) setError(true);
      })
      .finally(() => {
        if (requestGeneration === generation.current) setLoading(false);
      });
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
            !loading &&
            !stale &&
            !error &&
            nextOffset === undefined &&
            nextCursor === undefined ? (
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
              {(loading || (stale && !error)) && (
                <ActivityIndicator color={colors.primary} />
              )}
              {(nextOffset !== undefined || nextCursor !== undefined) &&
                !loading &&
                !stale && (
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
