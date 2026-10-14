import { ImageSourcePropType } from "react-native";

// 3D medallions for the badge iconKeys (scripts/progression/seed.ts), made
// with Gemini on Vertex. Unknown keys (e.g. "crown" before its art exists)
// show the star.
const art = {
  lotus: require("../../assets/badges/lotus.webp"),
  diya: require("../../assets/badges/diya.webp"),
  sun: require("../../assets/badges/sun.webp"),
  mala: require("../../assets/badges/mala.webp"),
  om: require("../../assets/badges/om.webp"),
  sunrise: require("../../assets/badges/sunrise.webp"),
  temple: require("../../assets/badges/temple.webp"),
  flag: require("../../assets/badges/flag.webp"),
  arrow: require("../../assets/badges/arrow.webp"),
  star: require("../../assets/badges/star.webp"),
} satisfies Record<string, ImageSourcePropType>;

export function badgeArt(iconKey: string): ImageSourcePropType {
  return (art as Record<string, ImageSourcePropType>)[iconKey] ?? art.star;
}
