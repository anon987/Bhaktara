// What a home puja offers to each deity (D-054). Sources in docs (doc 10
// checkpoint): panchopachar order, flowers and bhog by deity, and the
// flowers that must never be offered (ketaki and tulsi to Shiva, tulsi to
// Ganesha, durva to the Devi). Unknown deities (P-11 pending) get the
// general offerings that suit every deity.

// The tray, left to right in the traditional order. Every item can be used
// at any time; the next one in this order glows.
export const trayItems = [
  "kalash",
  "ghanti",
  "chandan",
  "pushp",
  "dhoop",
  "naivedya",
  "deep",
  "shankh",
] as const;
export type TrayItem = (typeof trayItems)[number];

export const flowerKinds = [
  "bilva",
  "dhatura",
  "aak",
  "kaner",
  "durva",
  "hibiscus",
  "genda",
  "tulsi",
  "lotus",
  "jasmine",
  "champa",
  "rose",
] as const;
export type FlowerKind = (typeof flowerKinds)[number];

export const garlandKinds = ["genda", "rose", "jasmine", "rudraksha"] as const;
export type GarlandKind = (typeof garlandKinds)[number];

export const bhogKinds = [
  "modak",
  "laddoo",
  "makhanMishri",
  "peda",
  "kheer",
  "doodh",
  "panchamrit",
  "gudChana",
  "halwa",
  "coconut",
  "banana",
  "mishri",
] as const;
export type BhogKind = (typeof bhogKinds)[number];

// Tilak marks: tripundra (three lines of ash) for Shiva, urdhva pundra for
// the Vaishnava deities, a red bindu (kumkum/sindoor) for the others.
export type TilakStyle = "tripundra" | "urdhvaPundra" | "bindu";

export type DeityOfferings = {
  flowers: FlowerKind[];
  garland: GarlandKind;
  bhog: BhogKind[];
  tilak: TilakStyle;
  // Vishnu's family receive bhog with a tulsi leaf.
  tulsiOnBhog: boolean;
};

const general: DeityOfferings = {
  flowers: ["genda", "rose", "jasmine"],
  garland: "genda",
  bhog: ["laddoo", "banana", "mishri"],
  tilak: "bindu",
  tulsiOnBhog: false,
};

const vaishnava = (bhog: BhogKind[]): DeityOfferings => ({
  flowers: ["tulsi", "lotus", "jasmine", "champa"],
  garland: "jasmine",
  bhog,
  tilak: "urdhvaPundra",
  tulsiOnBhog: true,
});

const offerings: Record<string, DeityOfferings> = {
  shiva: {
    flowers: ["bilva", "dhatura", "aak", "kaner"],
    garland: "rudraksha",
    bhog: ["doodh", "panchamrit", "mishri"],
    tilak: "tripundra",
    tulsiOnBhog: false,
  },
  ganesha: {
    flowers: ["durva", "hibiscus", "genda"],
    garland: "genda",
    bhog: ["modak", "laddoo", "banana"],
    tilak: "bindu",
    tulsiOnBhog: false,
  },
  krishna: vaishnava(["makhanMishri", "peda", "banana"]),
  vishnu: vaishnava(["panchamrit", "kheer", "banana"]),
  ram: vaishnava(["kheer", "laddoo", "banana"]),
  lakshmi: {
    flowers: ["lotus", "rose", "genda"],
    garland: "rose",
    bhog: ["kheer", "coconut", "peda"],
    tilak: "bindu",
    tulsiOnBhog: false,
  },
  durga: {
    flowers: ["hibiscus", "rose", "genda"],
    garland: "rose",
    bhog: ["halwa", "kheer", "coconut"],
    tilak: "bindu",
    tulsiOnBhog: false,
  },
  hanuman: {
    flowers: ["rose", "genda", "jasmine"],
    garland: "genda",
    bhog: ["laddoo", "gudChana", "halwa"],
    tilak: "bindu",
    tulsiOnBhog: false,
  },
  saraswati: {
    flowers: ["lotus", "jasmine", "genda"],
    garland: "jasmine",
    bhog: ["kheer", "banana", "mishri"],
    tilak: "bindu",
    tulsiOnBhog: false,
  },
};

// Flowers never offered to a deity, whatever the configuration says.
export const forbiddenFlowers: Record<string, FlowerKind[]> = {
  shiva: ["tulsi"],
  ganesha: ["tulsi"],
  durga: ["durva"],
  lakshmi: ["durva"],
  saraswati: ["durva"],
};

export function offeringsFor(
  deityId: string | null | undefined,
): DeityOfferings {
  const base = (deityId && offerings[deityId]) || general;
  const banned = (deityId && forbiddenFlowers[deityId]) || [];
  return { ...base, flowers: base.flowers.filter((f) => !banned.includes(f)) };
}

// Names for screen readers (the puja screen shows no text, D-054).
type Name = { hi: string; en: string };
export const trayNames: Record<TrayItem, Name> = {
  kalash: { hi: "कलश जल छिड़कें", en: "Sprinkle water from the kalash" },
  ghanti: { hi: "घंटी बजाएँ", en: "Ring the bell" },
  chandan: { hi: "चंदन-रोली का तिलक", en: "Apply the chandan-roli tilak" },
  pushp: { hi: "फूल और माला चढ़ाएँ", en: "Offer flowers and a garland" },
  dhoop: { hi: "धूप दिखाएँ", en: "Offer incense" },
  naivedya: { hi: "भोग लगाएँ", en: "Offer bhog" },
  deep: { hi: "दीप से आरती करें", en: "Do the aarti with the lamp" },
  shankh: { hi: "शंख बजाएँ", en: "Blow the shankh" },
};
export const flowerNames: Record<FlowerKind, Name> = {
  bilva: { hi: "बेलपत्र", en: "Bilva leaves" },
  dhatura: { hi: "धतूरा", en: "Dhatura" },
  aak: { hi: "आक", en: "Aak" },
  kaner: { hi: "कनेर", en: "Kaner" },
  durva: { hi: "दूर्वा", en: "Durva grass" },
  hibiscus: { hi: "गुड़हल", en: "Hibiscus" },
  genda: { hi: "गेंदा", en: "Marigold" },
  tulsi: { hi: "तुलसी", en: "Tulsi" },
  lotus: { hi: "कमल", en: "Lotus" },
  jasmine: { hi: "चमेली", en: "Jasmine" },
  champa: { hi: "चंपा", en: "Champa" },
  rose: { hi: "गुलाब", en: "Rose" },
};
export const garlandNames: Record<GarlandKind, Name> = {
  genda: { hi: "गेंदे की माला", en: "Marigold garland" },
  rose: { hi: "गुलाब की माला", en: "Rose garland" },
  jasmine: { hi: "चमेली की माला", en: "Jasmine garland" },
  rudraksha: { hi: "रुद्राक्ष की माला", en: "Rudraksha garland" },
};
export const bhogNames: Record<BhogKind, Name> = {
  modak: { hi: "मोदक", en: "Modak" },
  laddoo: { hi: "लड्डू", en: "Laddoo" },
  makhanMishri: { hi: "माखन-मिश्री", en: "Makhan-mishri" },
  peda: { hi: "पेड़ा", en: "Peda" },
  kheer: { hi: "खीर", en: "Kheer" },
  doodh: { hi: "दूध", en: "Milk" },
  panchamrit: { hi: "पंचामृत", en: "Panchamrit" },
  gudChana: { hi: "गुड़-चना", en: "Gud-chana" },
  halwa: { hi: "हलवा", en: "Halwa" },
  coconut: { hi: "नारियल", en: "Coconut" },
  banana: { hi: "केला", en: "Banana" },
  mishri: { hi: "मिश्री", en: "Mishri" },
};
