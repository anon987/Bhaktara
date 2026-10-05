import React, { useEffect, useState } from "react";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Txt } from "../../components/ui";
import { ContentCard } from "../../components/ContentCard";
import { isPermanentError } from "../../repositories/firestoreErrors";

// With a backend session `local.favorites` mirrors the account list (newest
// first) and device storage is its cache; in fixture mode it is device-only.
export function FavoriteList({ onSelect }: { onSelect: (id: string) => void }) {
  const { local, catalog, getContent, t, favoritesStatus, refreshFavorites } =
    useApp();
  const [count, setCount] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  // Pick up changes made on other devices (throttled by the sync service);
  // when offline the cached list stays.
  useEffect(() => {
    refreshFavorites().catch(() => undefined);
  }, [refreshFavorites]);
  useEffect(() => {
    let active = true;
    const ids = local.favorites.slice(Math.max(0, count - 10), count);
    Promise.all(
      ids.map((id) =>
        getContent(id).catch((error: unknown) => {
          // Content that is no longer published is skipped, not an error.
          if (isPermanentError(error)) return null;
          throw error;
        }),
      ),
    )
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [local.favorites, count, attempt, getContent]);
  const items = local.favorites
    .slice(0, count)
    .flatMap((id) => catalog?.content.find((item) => item.id === id) ?? []);
  const waiting =
    favoritesStatus.source === "account" && favoritesStatus.waiting;
  if (!local.favorites.length)
    return (
      <Card>
        <Txt bold>{t("noFavorites")}</Txt>
        <Txt muted>{t("noFavoritesHint")}</Txt>
        {waiting && <Txt muted>{t("favoritesWaiting")}</Txt>}
      </Card>
    );
  return (
    <>
      {waiting && <Txt muted>{t("favoritesWaiting")}</Txt>}
      {items.map((item) => (
        <ContentCard
          key={item.id}
          compact
          item={item}
          onPress={() => onSelect(item.id)}
        />
      ))}
      {status === "loading" && <Txt>{t("loading")}</Txt>}
      {status === "error" && (
        <Card>
          <Txt>{t("error")}</Txt>
          <Button
            label={t("retry")}
            onPress={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
              refreshFavorites({ force: true }).catch(() => undefined);
            }}
          />
        </Card>
      )}
      {local.favorites.length > count && status === "ready" && (
        <Button
          secondary
          label={t("loadMore")}
          onPress={() => {
            setStatus("loading");
            setCount((value) => value + 10);
          }}
        />
      )}
    </>
  );
}
