import React, { useEffect, useState } from "react";
import { useApp } from "../../app/providers/AppProvider";
import { Button, Card, Txt } from "../../components/ui";
import { ContentCard } from "../../components/ContentCard";

export function FavoriteList({ onSelect }: { onSelect: (id: string) => void }) {
  const { local, catalog, getContent, t } = useApp();
  const [count, setCount] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    let active = true;
    const ids = local.favorites.slice(Math.max(0, count - 10), count);
    Promise.all(ids.map(getContent))
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
  if (!local.favorites.length)
    return (
      <Card>
        <Txt bold>{t("noFavorites")}</Txt>
        <Txt muted>{t("noFavoritesHint")}</Txt>
      </Card>
    );
  return (
    <>
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
