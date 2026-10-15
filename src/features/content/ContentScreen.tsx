import React, { useEffect, useState } from "react";
import { Heart, Play } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import {
  Button,
  IconButton,
  Notice,
  Page,
  Row,
  Txt,
} from "../../components/ui";
import { DevotionalArt } from "../../components/DevotionalArt";
import { colors } from "../../theme/tokens";
import { usePlayer } from "../player/PlayerProvider";
import { audioTypes, playableVariant } from "../player/playback";
import { resolveMediaUrl } from "../../services/media/config";
import { StatusVideo } from "./StatusVideo";
import { SaveActions } from "./SaveActions";
import { WallpaperViewer } from "./WallpaperViewer";
export function ContentScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParams, "Content">) {
  const { catalog, local, t, toggleFavorite, getContent } = useApp();
  const player = usePlayer();
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const item = catalog?.content.find(
    (value) => value.id === route.params.contentId,
  );
  useEffect(() => {
    if (item) return;
    let active = true;
    getContent(route.params.contentId)
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [item, getContent, route.params.contentId, attempt]);
  if (!item)
    return (
      <Page title={t("noResults")} onBack={navigation.goBack}>
        <Txt>
          {t(
            status === "loading"
              ? "loading"
              : status === "error"
                ? "error"
                : "noResultsHint",
          )}
        </Txt>
        {status === "error" && (
          <Button
            label={t("retry")}
            onPress={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          />
        )}
      </Page>
    );
  // Wallpapers open full screen, with swipe-up paging and floating actions.
  if (item.type === "WALLPAPER")
    return (
      <WallpaperViewer
        key={item.id}
        item={item}
        source={route.params.source ?? "explore"}
        onBack={navigation.goBack}
      />
    );
  const favorite = local.favorites.includes(item.id);
  const audio = audioTypes.includes(item.type);
  const variant = playableVariant(item);
  const playable = Boolean(variant && resolveMediaUrl(variant.key));
  return (
    <Page title={t("preview")} onBack={navigation.goBack}>
      {item.type === "STATUS" ? (
        // Poster first; the video loads only when tapped (doc 22 §A5).
        <StatusVideo
          key={item.id}
          content={item}
          source={route.params.source ?? "explore"}
        />
      ) : (
        <>
          {/* Detail screens load the larger variant; lists stay on thumb (doc 22 §A5). */}
          <DevotionalArt
            assetKey={
              (item.media.mobile ?? item.media.poster ?? item.media.thumb).key
            }
            size={350}
          />
          <Txt muted size={11} style={{ textAlign: "center" }}>
            {t("placeholder")}
          </Txt>
        </>
      )}
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
      {!!item.description[local.language] && (
        <Txt muted>{item.description[local.language]}</Txt>
      )}
      {audio && (
        <>
          <Button
            icon={Play}
            label={t("listen")}
            onPress={() => {
              player.load(item, route.params.source ?? "explore");
              navigation.navigate("Player");
            }}
          />
          {!playable && <Notice text={t("audioUnavailable")} />}
        </>
      )}
      <SaveActions item={item} />
      <Txt size={11} muted>
        {t("demo")}
      </Txt>
    </Page>
  );
}
