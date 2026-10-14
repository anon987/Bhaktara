import { Catalog, Content, ContentType } from "../domain/models";
import {
  HomeCollection,
  HomeLanguage,
  HomeLayoutSection,
  HomeShortcut,
} from "../domain/home";
const entry = (
  id: string,
  type: ContentType,
  en: string,
  hi: string,
  deity: string,
  durationSeconds?: number,
): Content => ({
  id,
  type,
  title: { en, hi },
  description: {
    en: "A quiet moment for your daily devotion.",
    hi: "आपकी दैनिक भक्ति के लिए कुछ शांत पल।",
  },
  deityIds: [deity],
  searchTokens: [
    en.toLowerCase(),
    hi,
    deity,
    type.toLowerCase(),
    deity === "hanuman" ? "hanumaan" : deity,
  ],
  media: { thumb: { key: `placeholder/${deity}` } },
  durationSeconds,
  saveGate: "REWARDED",
  isShareable: true,
});
export const fixtures: Catalog = {
  deities: [
    {
      id: "shiva",
      name: { en: "Shiva", hi: "शिव" },
      artKey: "placeholder/shiva",
    },
    {
      id: "krishna",
      name: { en: "Krishna", hi: "कृष्ण" },
      artKey: "placeholder/krishna",
    },
    {
      id: "ganesha",
      name: { en: "Ganesha", hi: "गणेश" },
      artKey: "placeholder/ganesha",
    },
    {
      id: "hanuman",
      name: { en: "Hanuman", hi: "हनुमान" },
      artKey: "placeholder/hanuman",
    },
    {
      id: "durga",
      name: { en: "Durga", hi: "दुर्गा" },
      artKey: "placeholder/durga",
    },
  ],
  content: [
    entry(
      "bhajan-1",
      "BHAJAN",
      "A morning with Krishna",
      "कृष्ण के संग एक सुबह",
      "krishna",
      324,
    ),
    entry("aarti-1", "AARTI", "Shiva aarti", "शिव आरती", "shiva", 278),
    entry("mantra-1", "MANTRA", "Ganesha mantra", "गणेश मंत्र", "ganesha", 608),
    entry(
      "chalisa-1",
      "CHALISA",
      "Hanuman Chalisa",
      "हनुमान चालीसा",
      "hanuman",
      542,
    ),
    entry(
      "wallpaper-1",
      "WALLPAPER",
      "A golden sanctuary",
      "सुनहरा भक्ति स्थल",
      "durga",
    ),
    entry(
      "ringtone-1",
      "RINGTONE",
      "Temple bells",
      "मंदिर की घंटियाँ",
      "shiva",
      25,
    ),
    entry(
      "status-1",
      "STATUS",
      "A moment of bhakti",
      "भक्ति के कुछ पल",
      "krishna",
      20,
    ),
    entry(
      "bhajan-2",
      "BHAJAN",
      "Evening devotion",
      "संध्या भक्ति",
      "hanuman",
      310,
    ),
    entry("wallpaper-2", "WALLPAPER", "Lotus light", "कमल की आभा", "ganesha"),
    entry(
      "aarti-krishna",
      "AARTI",
      "Krishna aarti",
      "कृष्ण आरती",
      "krishna",
      280,
    ),
    entry(
      "aarti-ganesha",
      "AARTI",
      "Ganesha aarti",
      "गणेश आरती",
      "ganesha",
      265,
    ),
    entry(
      "aarti-hanuman",
      "AARTI",
      "Hanuman aarti",
      "हनुमान आरती",
      "hanuman",
      290,
    ),
    entry("aarti-durga", "AARTI", "Durga aarti", "दुर्गा आरती", "durga", 300),
  ],
  banners: [
    {
      id: "morning",
      title: {
        en: "Begin with\na little bhakti.",
        hi: "दिन की शुरुआत,\nभक्ति के साथ।",
      },
      subtitle: {
        en: "A peaceful pause. A brighter day.",
        hi: "शांति के कुछ पल। एक सुंदर दिन।",
      },
      cta: {
        en: "Find your morning ritual",
        hi: "अपना दैनिक अभ्यास शुरू करें",
      },
      artKey: "placeholder/ganesha",
      target: { route: "sadhana" },
    },
    {
      id: "mandir",
      title: {
        en: "Your mandir.\nYour moment.",
        hi: "आपका मंदिर।\nआपके भक्ति पल।",
      },
      subtitle: {
        en: "Light a diya. Make space for peace.",
        hi: "दीप जलाएँ। मन में शांति लाएँ।",
      },
      cta: { en: "Visit your Mandir", hi: "अपने मंदिर में जाएँ" },
      artKey: "placeholder/shiva",
      target: { route: "mandir" },
    },
  ],
  challenges: [
    {
      id: "daily",
      title: { en: "Make time for stillness", hi: "शांति के लिए समय निकालें" },
      period: "DAILY",
      progress: 0,
      target: 5,
      xpReward: 20,
    },
    {
      id: "weekly",
      title: {
        en: "A week of small beginnings",
        hi: "छोटी शुरुआत का एक सप्ताह",
      },
      period: "WEEKLY",
      progress: 2,
      target: 7,
      xpReward: 70,
    },
  ],
  sampleStats: { totalXp: 1250, level: 6, currentStreak: 7 },
};

// Synthetic Home configuration (doc 06 §3 `homeLayout/{language}`). The order
// differs per language to exercise the CMS per-language ordering.
export const homeCollections: HomeCollection[] = [
  {
    id: "aarti-sangrah",
    itemIds: [
      "aarti-1",
      "aarti-krishna",
      "aarti-ganesha",
      "aarti-hanuman",
      "aarti-durga",
    ],
  },
];
const shortcut = (
  iconKey: string,
  en: string,
  hi: string,
  target: HomeShortcut["target"],
): HomeShortcut => ({ label: { en, hi }, iconKey, target });
const shortcuts: HomeShortcut[] = [
  shortcut("bhajan", "Bhajan", "भजन", {
    route: "explore",
    params: { category: "BHAJAN" },
  }),
  shortcut("aarti", "Aarti", "आरती", {
    route: "explore",
    params: { category: "AARTI" },
  }),
  shortcut("mantra", "Mantra", "मंत्र", {
    route: "explore",
    params: { category: "MANTRA" },
  }),
  shortcut("chalisa", "Chalisa", "चालीसा", {
    route: "explore",
    params: { category: "CHALISA" },
  }),
  shortcut("wallpaper", "Wallpapers", "वॉलपेपर", {
    route: "explore",
    params: { category: "WALLPAPER" },
  }),
  shortcut("ringtone", "Ringtones", "रिंगटोन", {
    route: "explore",
    params: { category: "RINGTONE" },
  }),
  shortcut("status", "Status", "स्टेटस", {
    route: "explore",
    params: { category: "STATUS" },
  }),
  shortcut("mandir", "Mandir", "मंदिर", { route: "mandir" }),
];
const sections = {
  progress: { id: "progress", type: "PROGRESS", visible: true },
  shortcuts: {
    id: "shortcuts",
    type: "SHORTCUTS",
    title: { en: "Your daily companions", hi: "आपकी दैनिक भक्ति" },
    items: shortcuts,
    visible: true,
  },
  sadhana: {
    id: "sadhana",
    type: "SADHANA",
    title: { en: "Today’s Sadhana", hi: "आज की साधना" },
    visible: true,
  },
  trending: {
    id: "trending",
    type: "RAIL",
    title: { en: "A moment of devotion", hi: "भक्ति के कुछ पल" },
    source: { sort: "POPULAR" },
    limit: 6,
    visible: true,
  },
  aarti: {
    id: "aarti-sangrah",
    type: "RAIL",
    title: { en: "Aarti collection", hi: "आरती संग्रह" },
    source: { collectionId: "aarti-sangrah" },
    limit: 6,
    visible: true,
  },
  bhajans: {
    id: "bhajans",
    type: "RAIL",
    title: { en: "Bhajans", hi: "भजन" },
    source: { contentType: "BHAJAN", sort: "POPULAR" },
    limit: 6,
    visible: false,
  },
  quote: {
    id: "quote",
    type: "QUOTE",
    text: {
      en: "Where there is devotion, there is peace.",
      hi: "जहाँ भक्ति है, वहाँ शांति है।",
    },
    visible: true,
  },
} satisfies Record<string, Omit<HomeLayoutSection, "order">>;
const ordered = (...items: Omit<HomeLayoutSection, "order">[]) =>
  items.map((item, index) => ({ ...item, order: (index + 1) * 10 }));
export const homeLayouts: Record<HomeLanguage, HomeLayoutSection[]> = {
  en: ordered(
    sections.progress,
    sections.shortcuts,
    sections.sadhana,
    sections.trending,
    sections.aarti,
    sections.bhajans,
    sections.quote,
  ),
  hi: ordered(
    sections.sadhana,
    sections.shortcuts,
    sections.aarti,
    sections.trending,
    sections.progress,
    sections.bhajans,
    sections.quote,
  ),
};
// Published mandirOfferings documents for fixture mode. The app bundles the
// full default decor (assets/mandir); these show admin changes on top of it:
// marigold lights made free and moved first for a festival (the image key is
// a placeholder, so the bundled image of the same id is kept), and a
// switched-off item that the app must skip.
export const mandirOfferingDocuments: { id: string; data: unknown }[] = [
  {
    id: "light-marigold",
    data: {
      name: { en: "Marigold lights", hi: "गेंदे की लाइट माला" },
      kind: "light",
      art: { mobile: { key: "placeholder/mandir/light-marigold" } },
      placement: "top",
      deityIds: [],
      unlock: "FREE",
      sortOrder: 5,
      isActive: true,
    },
  },
  {
    id: "bell-retired",
    data: {
      name: { en: "Old bell", hi: "पुरानी घंटी" },
      kind: "bell",
      art: { mobile: { key: "placeholder/mandir/bell-retired" } },
      deityIds: [],
      unlock: "FREE",
      sortOrder: 90,
      isActive: false,
    },
  },
];
