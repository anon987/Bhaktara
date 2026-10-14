import { useMemo } from "react";
import { useApp } from "../../app/providers/AppProvider";
import type { Content } from "../../domain/models";
import { strings, type StringKey } from "../../i18n/strings";

// What the player shows about an item: its title in the app language, the
// other language's title when it differs, and the deity name(s) (or the
// content type, e.g. "Bhajan", when it has no deity in the catalog).
export function useNowPlayingInfo(item: Content | null) {
  const { local, catalog, t } = useApp();
  const language = local.language;
  return useMemo(() => {
    if (!item) return null;
    const title = item.title[language] || item.title.en || item.title.hi;
    const otherTitle = item.title[language === "hi" ? "en" : "hi"]?.trim();
    const deities = item.deityIds
      .map((id) => catalog?.deities.find((deity) => deity.id === id))
      .flatMap((deity) => (deity ? [deity.name[language]] : []));
    const typeKey = item.type.toLowerCase();
    const subtitle = deities.length
      ? deities.join(" · ")
      : typeKey in strings
        ? t(typeKey as StringKey)
        : "";
    return {
      title,
      otherTitle: otherTitle && otherTitle !== title ? otherTitle : null,
      subtitle,
    };
  }, [item, language, catalog, t]);
}
