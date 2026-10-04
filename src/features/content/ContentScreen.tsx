import React from "react";
import { Heart, Play, Share2 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  Card,
  IconButton,
  Notice,
  Page,
  Row,
  Txt,
  useUnavailable,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { platformServices } from "../../services/platform";
export function ContentScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParams, "Content">) {
  const { catalog, local, t, selectContent, toggleFavorite } = useApp();
  const unavailable = useUnavailable();
  const item = catalog?.content.find(
    (value) => value.id === route.params.contentId,
  );
  if (!item)
    return (
      <Page title={t("noResults")} onBack={navigation.goBack}>
        <Txt>{t("noResultsHint")}</Txt>
      </Page>
    );
  const favorite = local.favorites.includes(item.id);
  const audio = ["BHAJAN", "AARTI", "MANTRA", "CHALISA", "RINGTONE"].includes(
    item.type,
  );
  return (
    <Page title={t("preview")} onBack={navigation.goBack}>
      <DevotionalArt assetKey={item.media.thumb.key} size={350} />
      <Txt muted size={11} style={{ textAlign: "center" }}>
        {t("placeholder")}
      </Txt>
      <Row>
        <Txt bold size={28} style={{ flex: 1 }}>
          {item.title[local.language]}
        </Txt>
        <IconButton
          icon={Heart}
          label={t(favorite ? "unfavorite" : "favorite")}
          selected={favorite}
          color={colors.primary}
          onPress={() => toggleFavorite(item.id)}
        />
      </Row>
      <Txt muted>{item.description[local.language]}</Txt>
      {audio && (
        <>
          <Button
            icon={Play}
            label={t("audioPreview")}
            onPress={() => {
              selectContent(item.id);
              navigation.navigate("Player");
            }}
          />
          <Notice text={t("noAudio")} />
        </>
      )}
      {["WALLPAPER", "RINGTONE", "STATUS"].includes(item.type) && (
        <Card>
          <Button
            label={t("save")}
            onPress={() => unavailable("adsUnavailable")}
          />
          {item.type === "STATUS" && (
            <Button
              secondary
              icon={Share2}
              label={t("share")}
              onPress={() => {
                void platformServices.share.shareStatus(item.media.thumb.key);
                unavailable("shareUnavailable");
              }}
            />
          )}
        </Card>
      )}
      <Txt size={11} muted>
        {t("demo")}
      </Txt>
    </Page>
  );
}
