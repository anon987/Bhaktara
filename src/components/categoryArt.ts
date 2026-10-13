import { ImageSourcePropType } from "react-native";
import { ContentType } from "../domain/models";

// 3D devotional art for each category's Explore tile (made with Gemini on
// Vertex, background removed): wallpaper frame, harmonium, aarti thali, mala,
// chalisa book, temple bell, phone with a diya.
export const categoryArt: Record<ContentType, ImageSourcePropType> = {
  WALLPAPER: require("../../assets/categories/wallpaper.webp"),
  BHAJAN: require("../../assets/categories/bhajan.webp"),
  AARTI: require("../../assets/categories/aarti.webp"),
  MANTRA: require("../../assets/categories/mantra.webp"),
  CHALISA: require("../../assets/categories/chalisa.webp"),
  RINGTONE: require("../../assets/categories/ringtone.webp"),
  STATUS: require("../../assets/categories/status.webp"),
};
