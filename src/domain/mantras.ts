// Bead materials follow the deity's tradition.
export type MalaKind =
  "rudraksha" | "tulsi" | "chandan" | "lalChandan" | "sphatik";

// The mantra shown during jaap and the traditional mala for each deity.
// Unknown deities (the canonical list is pending, P-11) fall back to "ॐ" on
// a tulsi mala.
export type DeityMantra = {
  mantra: { hi: string; en: string };
  mala: MalaKind;
  malaName: { hi: string; en: string };
};

const malaNames: Record<MalaKind, { hi: string; en: string }> = {
  rudraksha: { hi: "रुद्राक्ष माला", en: "Rudraksha mala" },
  tulsi: { hi: "तुलसी माला", en: "Tulsi mala" },
  chandan: { hi: "चंदन माला", en: "Sandalwood mala" },
  lalChandan: { hi: "लाल चंदन माला", en: "Red sandalwood mala" },
  sphatik: { hi: "स्फटिक माला", en: "Crystal mala" },
};

const entry = (hi: string, en: string, mala: MalaKind): DeityMantra => ({
  mantra: { hi, en },
  mala,
  malaName: malaNames[mala],
});

const mantras: Record<string, DeityMantra> = {
  shiva: entry("ॐ नमः शिवाय", "Om Namah Shivaya", "rudraksha"),
  // The Maha-mantra, one line per half-verse.
  krishna: entry(
    "हरे कृष्ण हरे कृष्ण\nकृष्ण कृष्ण हरे हरे\nहरे राम हरे राम\nराम राम हरे हरे",
    "Hare Krishna Hare Krishna\nKrishna Krishna Hare Hare\nHare Rama Hare Rama\nRama Rama Hare Hare",
    "tulsi",
  ),
  ram: entry(
    "श्री राम जय राम जय जय राम",
    "Shri Ram Jai Ram Jai Jai Ram",
    "tulsi",
  ),
  ganesha: entry("ॐ गं गणपतये नमः", "Om Gam Ganapataye Namah", "chandan"),
  hanuman: entry("ॐ हं हनुमते नमः", "Om Ham Hanumate Namah", "lalChandan"),
  durga: entry("ॐ दुं दुर्गायै नमः", "Om Dum Durgayai Namah", "lalChandan"),
  lakshmi: entry(
    "ॐ श्रीं महालक्ष्म्यै नमः",
    "Om Shreem Mahalakshmyai Namah",
    "sphatik",
  ),
  saraswati: entry("ॐ ऐं सरस्वत्यै नमः", "Om Aim Saraswatyai Namah", "sphatik"),
  vishnu: entry("ॐ नमो नारायणाय", "Om Namo Narayanaya", "tulsi"),
};
const fallback = entry("ॐ", "Om", "tulsi");

export const mantraFor = (deityId: string | null | undefined): DeityMantra =>
  (deityId && mantras[deityId]) || fallback;
