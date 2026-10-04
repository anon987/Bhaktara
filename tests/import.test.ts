import {
  buildDocuments,
  checklist,
  parseCsv,
  parseRow,
  unknownColumns,
} from "../scripts/content/manifest";
import { contentSchema } from "../src/domain/models";

const allChecks = (items: readonly string[]) =>
  Object.fromEntries(items.map((item) => [`check_${item}`, "yes"]));
const wallpaper = {
  importKey: "wallpaper-hanuman-dawn",
  type: "wallpaper",
  title_hi: "सुबह के हनुमान",
  title_en: "Hanuman at dawn",
  description_hi: "भोर की रोशनी।",
  description_en: "Morning light.",
  deityIds: "hanuman",
  categoryIds: "wallpapers",
  tags: "hanumaan|bajrang",
  image: "wallpapers/dawn.png",
  aiTool: "ToolName",
  aiPlan: "Pro",
  ...allChecks(checklist.all),
};
const media = {
  thumb: { key: "wallpaper/wallpaper-hanuman-dawn/thumb.0a1b2c3d.webp" },
  mobile: { key: "wallpaper/wallpaper-hanuman-dawn/mobile.0a1b2c3d.webp" },
};
const deities = new Map([
  [
    "hanuman",
    { name: { en: "Hanuman", hi: "हनुमान" }, aliases: ["bajrangbali"] },
  ],
]);

test("CSV parsing handles quotes, embedded commas and newlines, CRLF and BOM", () => {
  const rows = parseCsv(
    '﻿importKey,title_en,sourceText\r\na-1,"Hello, world","line one\nline ""two"""\r\n\r\nb-2,Plain,\n',
  );
  expect(rows).toEqual([
    {
      importKey: "a-1",
      title_en: "Hello, world",
      sourceText: 'line one\nline "two"',
    },
    { importKey: "b-2", title_en: "Plain", sourceText: "" },
  ]);
  expect(() => parseCsv('a,b\n"open,1\n')).toThrow(/Unterminated/);
  expect(() => parseCsv("a,b\n1,2,3\n")).toThrow(/more cells/);
});

test("unknown or misspelled columns are reported", () => {
  expect(
    unknownColumns([
      "importKey",
      "titel_en",
      "check_titleChecked",
      "check_madeUp",
    ]),
  ).toEqual(["titel_en", "check_madeUp"]);
});

test("rows normalize types, lists and flags", () => {
  const { row, errors } = parseRow({
    ...wallpaper,
    isFeatured: "Yes",
    isShareable: "no",
  });
  expect(errors).toEqual([]);
  expect(row).toMatchObject({
    type: "WALLPAPER",
    deityIds: ["hanuman"],
    tags: ["hanumaan", "bajrang"],
    isFeatured: true,
    isShareable: false,
    adEligible: true,
  });
});

test("rows report every problem with its field", () => {
  const { errors } = parseRow({
    ...wallpaper,
    importKey: "Bad Key",
    type: "MANTRA",
    deityIds: "",
    aiPlan: "",
    image: "",
  });
  const text = errors.join("\n");
  for (const fragment of [
    "importKey: must be a lowercase slug",
    "deityIds: needs at least one deity",
    "aiPlan:",
    "sourceText: sacred text types need the canonical source text",
    "sourceTextRef:",
    "audio: MANTRA needs an audio file",
    "image: MANTRA needs a thumbnail image",
  ])
    expect(text).toContain(fragment);
  expect(parseRow({ ...wallpaper, type: "SCRIPTURE" }).errors[0]).toMatch(
    /^type:/,
  );
});

test("a complete checklist lands in READY; gaps stay in DRAFT", () => {
  const complete = parseRow(wallpaper).row!;
  const ready = buildDocuments({
    row: complete,
    media,
    deities,
    existing: null,
    publishReady: false,
    now: "NOW",
  });
  expect(ready.status).toBe("READY");
  expect(ready.content).not.toHaveProperty("publishedAt");
  const draft = buildDocuments({
    row: parseRow({ ...wallpaper, check_noDistortions: "" }).row!,
    media,
    deities,
    existing: null,
    publishReady: true,
    now: "NOW",
  });
  expect(draft.status).toBe("DRAFT");
  expect(draft.missing).toEqual(["noDistortions"]);
  // Sacred text audio needs its extra listen-through checks.
  const mantra = parseRow({
    ...wallpaper,
    type: "MANTRA",
    audio: "a.wav",
    sourceText: "ॐ",
    sourceTextRef: "Edition",
  }).row!;
  expect(
    buildDocuments({
      row: mantra,
      media,
      deities,
      existing: null,
      publishReady: false,
      now: 1,
    }).missing,
  ).toEqual(checklist.sacredAudio);
});

test("published items are never moved backwards and keep server fields", () => {
  const row = parseRow(wallpaper).row!;
  const existing = {
    status: "PUBLISHED",
    popularityScore: 42,
    publishedAt: "EARLIER",
  };
  const kept = buildDocuments({
    row,
    media,
    deities,
    existing,
    publishReady: false,
    now: "NOW",
  });
  expect(kept.status).toBe("PUBLISHED");
  expect(kept.content).toMatchObject({
    popularityScore: 42,
    publishedAt: "EARLIER",
  });
  expect(kept.privateRecord).not.toHaveProperty("createdAt");
  expect(() =>
    buildDocuments({
      row: parseRow({ ...wallpaper, check_titleChecked: "no" }).row!,
      media,
      deities,
      existing,
      publishReady: false,
      now: "NOW",
    }),
  ).toThrow(/is PUBLISHED; its checklist must stay complete/);
});

test("documents carry derived fields and parse as app content", () => {
  const audio = parseRow({
    ...wallpaper,
    importKey: "bhajan-1",
    type: "BHAJAN",
    audio: "a.wav",
    ...allChecks([...checklist.all, ...checklist.bhajan]),
  }).row!;
  const built = buildDocuments({
    row: audio,
    media: {
      ...media,
      stream: {
        key: "bhajan/bhajan-1/stream.0a1b2c3d.m4a",
        durationSeconds: 61.2,
      },
    },
    deities,
    existing: null,
    publishReady: true,
    now: "NOW",
  });
  expect(built.status).toBe("PUBLISHED");
  expect(built.content).toMatchObject({
    saveGate: "FREE",
    durationSeconds: 61.2,
    popularityScore: 0,
    publishedAt: "NOW",
    isPremium: false,
  });
  // Deity names, aliases and transliteration tags all feed search.
  expect(built.content.searchTokens).toEqual(
    expect.arrayContaining([
      "hanuman",
      "हनुमान",
      "bajrangbali",
      "bajrang",
      "ha",
    ]),
  );
  expect(built.privateRecord).toMatchObject({
    importKey: "bhajan-1",
    createdAt: "NOW",
  });
  expect(
    contentSchema.safeParse({ ...built.content, id: built.contentId }).success,
  ).toBe(true);
  expect(
    buildDocuments({
      row: parseRow(wallpaper).row!,
      media,
      deities,
      existing: null,
      publishReady: false,
      now: 1,
    }).content.saveGate,
  ).toBe("REWARDED");
});
