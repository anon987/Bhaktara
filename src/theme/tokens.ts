// The Hindu palette: haldi-cream grounds, kumkum red for what you press,
// bhagwa saffron and marigold for warmth, temple gold lines and maroon text.
export const colors = {
  background: "#FFF4DF",
  surface: "#FFFBF3",
  ink: "#3A0F0C",
  muted: "#7A4A35",
  primary: "#C1271D",
  saffron: "#F57C00",
  gold: "#C9962B",
  marigold: "#FFB300",
  line: "#F1D29A",
  pale: "#FFE6BC",
  green: "#1F7A45",
  greenPale: "#E4F2DF",
  dark: "#6B0F12",
  white: "#FFFFFF",
  // Page headers run bhagwa → saffron → kumkum; the tab bar is temple maroon.
  bhagwa: "#FF9933",
  maroon: "#6B0F12",
  haldi: "#F4C430",
  headerText: "#FFF3DC",
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 12, md: 20, lg: 28, pill: 999 };
export const fonts = {
  en: "DMSans",
  hi: "NotoDevanagari",
  enBold: "DMSansBold",
  hiBold: "NotoDevanagariBold",
};
// Practice screens (jaap, dhyan, prarthana): a lamp-lit sanctum at dusk.
// Deep sandalwood and maroon grounds with brass, ghee-light and kumkum.
export const sanctum = {
  night: "#1E110D",
  maroon: "#3F1A14",
  sandal: "#5A2E1F",
  brass: "#D9A441",
  brassLight: "#F3D58A",
  brassDeep: "#9C6B1E",
  ghee: "#FFE6A8",
  flame: "#FF9E2C",
  flameCore: "#FFF4D6",
  kumkum: "#C0281F",
  marigold: "#F59A1B",
  marigoldDeep: "#D9600F",
  leaf: "#4E7A35",
  leafDark: "#2F5223",
  clay: "#A0522D",
  clayDark: "#6E3218",
  text: "#FBEBD3",
  textMuted: "#D6BFA3",
};
// Prayer and Jaap (D-057): a sunlit marble shrine. Parchment and ivory
// grounds, maroon serif headings, antique gold lines and saffron for what is
// chosen or done.
export const shrine = {
  parchment: "#FBF1DF",
  parchmentDeep: "#F3E2C3",
  ivory: "#FFF8EC",
  card: "#FFF5E4",
  line: "#E6CC9B",
  lineSoft: "rgba(201, 151, 63, 0.28)",
  gold: "#C9973F",
  goldDeep: "#9E7027",
  goldLight: "#F2D9A0",
  maroon: "#7A1C1C",
  maroonDeep: "#5A1212",
  ink: "#4A2A1A",
  inkMuted: "#8A6A4A",
  saffron: "#F0A23B",
  saffronLight: "#FFD58A",
  saffronDeep: "#D9801E",
  wood: "#9C6B45",
  woodDark: "#5E3A22",
  marble: "#F1E1C2",
  marbleShade: "#D9BC88",
  sanctumGreen: "#2E5A4A",
  sanctumGreenDeep: "#1C3D32",
};
// Headings on the Prayer and Jaap screens use the platform's serif (Noto
// Serif on Android, Georgia on iOS); Hindi keeps Noto Devanagari.
export const serif = { android: "serif", ios: "Georgia", default: "serif" };
