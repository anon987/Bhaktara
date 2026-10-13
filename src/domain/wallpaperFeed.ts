import { Content } from "./models";

// The full-screen viewer's pages: the opened wallpaper first, then the other
// wallpapers of its first deity in catalog order, wrapping round to the ones
// listed before it, so swiping up visits every one of them. The app catalog
// holds published content only. Without a deity it is a single page.
export function deityWallpapers(
  content: Content[],
  opened: Content,
): Content[] {
  const deity = opened.deityIds[0];
  if (!deity) return [opened];
  const all = content.filter(
    (item) =>
      item.type === "WALLPAPER" &&
      (item.id === opened.id || item.deityIds.includes(deity)),
  );
  const start = all.findIndex((item) => item.id === opened.id);
  if (start < 0) return [opened, ...all];
  return [...all.slice(start), ...all.slice(0, start)];
}
