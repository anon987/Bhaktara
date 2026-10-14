import { ImageSourcePropType } from "react-native";

// Soft screen backgrounds with Hindu motifs at the edges (made with Gemini on
// Vertex): the middle stays light so text on top reads clearly.
export const backgrounds = {
  home: require("../../assets/backgrounds/home.webp"),
  explore: require("../../assets/backgrounds/explore.webp"),
  mandir: require("../../assets/backgrounds/mandir.webp"),
  sadhana: require("../../assets/backgrounds/sadhana.webp"),
  profile: require("../../assets/backgrounds/profile.webp"),
  page: require("../../assets/backgrounds/page.webp"),
} satisfies Record<string, ImageSourcePropType>;
