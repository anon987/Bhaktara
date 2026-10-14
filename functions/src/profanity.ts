// Display-name filter (D-042, doc 08 updateProfile): English, Hindi
// (Devanagari) and Hinglish abuse, plus names that pose as Bhaktara staff.
// Matching is case- and diacritic-insensitive: both the name and the lists
// are lower-cased, decomposed (NFKD) and stripped of combining marks (Latin
// accents, Devanagari matras, nukta, anusvara, virama), common Cyrillic and
// Greek look-alikes are mapped to Latin, and repeated letters collapse
// ("fuuuck", "gaandu"). Kept on the server only, so the list is not shipped
// in the app.
//
// Two lists, to avoid blocking real names (the Scunthorpe problem):
// - WHOLE_WORDS match a whole word of the name only ("gand" would otherwise
//   block "Gandhi", "shit" the goddess "Shitala").
// - ANYWHERE match inside the name with the spaces, dots, apostrophes and
//   hyphens removed, so "m a d a r c h o d" and "Behen-chod" are caught.
//   Only long, unambiguous words belong here.

const WHOLE_WORDS = [
  // English
  "ass",
  "arse",
  "asshole",
  "bastard",
  "bitch",
  "bitches",
  "boob",
  "boobs",
  "cock",
  "crap",
  "cunt",
  "dick",
  "dildo",
  "fag",
  "faggot",
  "hoe",
  "horny",
  "nigga",
  "nigger",
  "penis",
  "porn",
  "pussy",
  "rape",
  "rapist",
  "sex",
  "sexy",
  "shit",
  "slut",
  "tits",
  "twat",
  "vagina",
  "whore",
  "wank",
  "wanker",
  // Hinglish
  "bhadwa",
  "bhadwe",
  "bhadva",
  "bhadve",
  "bkl",
  "bsdk",
  "chinal",
  "chhinal",
  "chod",
  "choot",
  "chut",
  "gaand",
  "gand",
  "gandu",
  "gaandu",
  "harami",
  "haramkhor",
  "jhaant",
  "jhant",
  "jhatu",
  "jhaatu",
  "kamina",
  "kamine",
  "kameena",
  "kameene",
  "kutiya",
  "kuttiya",
  "lauda",
  "laude",
  "lavda",
  "lawda",
  "lund",
  "mkc",
  "randi",
  "randwa",
  "tatti",
  // Hindi (Devanagari)
  "गांड",
  "गांडू",
  "गाण्डू",
  "चूत",
  "चुत",
  "चोद",
  "छिनाल",
  "झांट",
  "झाटू",
  "भड़वा",
  "भड़वे",
  "रंडी",
  "रण्डी",
  "लंड",
  "लण्ड",
  "लौड़ा",
  "लौड़े",
  "हरामी",
  "हरामखोर",
  "कमीना",
  "कमीने",
  "कुतिया",
  "टट्टी",
  "सेक्स",
  // Posing as staff
  "admin",
  "administrator",
  "moderator",
  "official",
  "support",
];

const ANYWHERE = [
  // English
  "asshole",
  "bitch",
  "blowjob",
  "bullshit",
  "dickhead",
  "fuck",
  "motherfucker",
  "nigger",
  "pussy",
  "whore",
  // Hinglish
  "behenchod",
  "behanchod",
  "bhenchod",
  "bahenchod",
  "bhosad",
  "bhosd",
  "bhosri",
  "chodu",
  "chutia",
  "chutiya",
  "chutiye",
  "gandmar",
  "gaandmar",
  "haramzada",
  "haramjada",
  "haraamzaada",
  "lodulalit",
  "madarchod",
  "maderchod",
  "maadarchod",
  "matherchod",
  "randibaaz",
  "randwa",
  // Hindi (Devanagari)
  "बहनचोद",
  "बहेनचोद",
  "बेहनचोद",
  "भेनचोद",
  "भोसड़",
  "भोसडी",
  "भोसड़ी",
  "मादरचोद",
  "मादरचोत",
  "चूतिया",
  "चुतिया",
  "चूतिये",
  "हरामज़ादा",
  "हरामजादा",
  "हरामज़ादे",
  "गांडमार",
  "रंडीबाज़",
  // The brand itself (no "Bhaktara Official")
  "bhaktara",
  "भक्तारा",
];

// Cyrillic and Greek letters that look like Latin ones.
const LOOK_ALIKES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ԛ: "q",
  ԝ: "w",
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
};

const SEPARATORS = /[\s.'’\-_]+/u;

// Lower case, no combining marks, look-alikes mapped to Latin.
export function foldForMatching(value: string): string {
  return [...value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")]
    .map((char) => LOOK_ALIKES[char] ?? char)
    .join("");
}

const collapseRepeats = (value: string) => value.replace(/(.)\1+/gu, "$1");

// The whole-word list is not collapsed ("boob" must not block "Bob"); a
// name's word is compared as written and with its repeats collapsed.
const wholeWords = new Set(WHOLE_WORDS.map(foldForMatching));
const anywhere = [
  ...new Set(ANYWHERE.map((word) => collapseRepeats(foldForMatching(word)))),
];

// True when a display name contains blocked words (see the lists above).
export function isNameBlocked(name: string): boolean {
  const words = foldForMatching(name).split(SEPARATORS).filter(Boolean);
  if (words.some((word) => wholeWords.has(word) || wholeWords.has(collapseRepeats(word))))
    return true;
  const compact = collapseRepeats(words.join(""));
  return anywhere.some((word) => compact.includes(word));
}
