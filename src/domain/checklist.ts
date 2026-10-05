import { ContentType } from "./models";

// Doc 12 §5 pre-publish checklist (single operator, D-001). Shared by the
// manifest importer, the CMS Cloud Functions and the admin web app, so every
// path into READY enforces the same items. Thumbnails exist for every type,
// so the visual checks apply to all items.
export const checklist = {
  all: [
    "titleChecked",
    "taxonomyChecked",
    "thumbnailReadable",
    "aiRecorded",
    "savePolicySet",
    "iconographyCorrect",
    "noDistortions",
    "respectfulFraming",
  ],
  sacredAudio: [
    "sourceTextStored",
    "listenThroughText",
    "sanskritChecked",
    "noAudioArtifacts",
  ],
  bhajan: ["listenThrough", "noUnintendedLyrics"],
  ringtone: ["cleanStartEnd", "loudEnough"],
} as const;
export type CheckItem = (typeof checklist)[keyof typeof checklist][number];
export const checkItems = Object.values(checklist).flat() as [
  CheckItem,
  ...CheckItem[],
];

export const checkLabels: Record<CheckItem, string> = {
  titleChecked: "Title correct in Hindi and English, spelling checked",
  taxonomyChecked: "Deity, category and tags correct",
  thumbnailReadable: "Thumbnail readable at small size",
  aiRecorded: "AI tool and plan recorded",
  savePolicySet: "Save/share policy set",
  iconographyCorrect:
    "Iconography correct (vahana, ayudh, attributes, arms, colours)",
  noDistortions: "No distorted hands, faces or extra limbs",
  respectfulFraming: "No disrespectful framing, cropping or overlays",
  sourceTextStored: "Canonical source text stored",
  listenThroughText:
    "Full listen-through against the text: no skipped, added or garbled lines",
  sanskritChecked: "Sanskrit sounds checked: anuswar, visarga, conjuncts",
  noAudioArtifacts: "No mid-word cuts, clipping or artifacts",
  listenThrough: "Full listen-through",
  noUnintendedLyrics: "No unintended lyrics or artifacts",
  cleanStartEnd: "Clean start and end, no clipped syllable",
  loudEnough: "Loud enough on a phone speaker",
};

// Mantra, chalisa and aarti need canonical source text (doc 12 §3).
export const sacredTypes: readonly ContentType[] = [
  "AARTI",
  "MANTRA",
  "CHALISA",
];

export function applicableChecks(type: ContentType): CheckItem[] {
  return [
    ...checklist.all,
    ...(sacredTypes.includes(type) ? checklist.sacredAudio : []),
    ...(type === "BHAJAN" ? checklist.bhajan : []),
    ...(type === "RINGTONE" ? checklist.ringtone : []),
  ];
}

// Keeps only the items that apply to the type, defaulting to unchecked.
export function checklistState(
  type: ContentType,
  checks: Partial<Record<string, boolean>>,
) {
  const items = applicableChecks(type);
  const values = Object.fromEntries(
    items.map((item) => [item, checks[item] === true]),
  ) as Record<CheckItem, boolean>;
  return { values, missing: items.filter((item) => !values[item]) };
}
