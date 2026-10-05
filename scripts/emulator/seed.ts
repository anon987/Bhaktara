import { parseArgs } from "node:util";
import { Timestamp } from "firebase-admin/firestore";
import {
  fixtures,
  homeCollections,
  homeLayouts,
} from "../../src/repositories/fixtures";
import {
  publishedContentSchema,
  deityDocumentSchema,
  bannerDocumentSchema,
  homeFeedDocumentSchema,
} from "../../src/repositories/firestoreSchemas";
import { buildHomeFeedSections, homeLanguages } from "../../src/domain/home";
import { buildSearchTokens } from "../../src/domain/search";
import {
  describeTarget,
  FirestoreTarget,
  resolveTarget,
  withFirestore,
} from "../firebase/target";

// Validated placeholder catalog: deities, banners, sample content and the
// precomputed Home feeds. These are synthetic development records, never
// reviewed launch content.
export async function seed(target: FirestoreTarget) {
  await withFirestore(target, async (db) => {
    const batch = db.batch();
    for (const [index, item] of fixtures.content.entries()) {
      const { id, ...content } = item;
      const value = JSON.parse(
        JSON.stringify({
          ...content,
          status: "PUBLISHED",
          popularityScore: 100 - index,
          searchTokens: buildSearchTokens([
            item.title.en,
            item.title.hi,
            ...item.searchTokens,
            ...item.deityIds,
          ]),
        }),
      );
      publishedContentSchema.parse({ ...value, id });
      batch.set(db.collection("content").doc(id), value);
    }
    for (const [index, deity] of fixtures.deities.entries()) {
      const value = {
        name: deity.name,
        isActive: true,
        isMandirEnabled: true,
        sortOrder: index,
        aliases: [],
        description: { en: "Placeholder deity", hi: "उदाहरण देवता" },
        media: { thumb: { key: deity.artKey } },
        mandirArt: { mobile: { key: deity.artKey } },
      };
      deityDocumentSchema.parse(value);
      batch.set(db.collection("deities").doc(deity.id), value);
    }
    const homeBanners = [];
    for (const [index, banner] of fixtures.banners.entries()) {
      const value = {
        title: banner.title,
        subtitle: banner.subtitle,
        ctaText: banner.cta,
        image: { mobile: { key: banner.artKey } },
        target: banner.target,
        priority: 10 - index,
        isActive: true,
        languages: ["hi", "en"],
        startAt: Timestamp.fromMillis(Date.now() - 86400000),
        endAt: Timestamp.fromMillis(Date.now() + 30 * 86400000),
      };
      bannerDocumentSchema.parse(value);
      batch.set(db.collection("banners").doc(banner.id), value);
      const {
        priority: _priority,
        isActive: _active,
        languages,
        ...resolved
      } = value;
      homeBanners.push({ languages, value: { id: banner.id, ...resolved } });
    }
    // Stand-in for the server `buildHomeFeed` job (doc 08): one resolved
    // homeFeeds/{language} doc per language, built from the fixture layouts.
    for (const language of homeLanguages) {
      const sections = JSON.parse(
        JSON.stringify(
          buildHomeFeedSections(
            homeLayouts[language],
            fixtures.content,
            homeCollections,
          ),
        ),
      );
      const banners = homeBanners
        .filter((banner) => banner.languages.includes(language))
        .map((banner) => banner.value);
      const value = {
        language,
        isPublished: true,
        schemaVersion: 1,
        generatedAt: Timestamp.now(),
        banners,
        sections,
      };
      const parsed = homeFeedDocumentSchema.parse(value);
      if (
        parsed.sections.length !== sections.length ||
        parsed.banners.length !== banners.length
      )
        throw new Error(`Invalid home feed fixture for ${language}`);
      batch.set(db.collection("homeFeeds").doc(language), value);
    }
    // Emulator only: a private draft lets the rules tests prove drafts stay hidden.
    if (target.kind === "emulator")
      batch.set(db.collection("content").doc("private-draft"), {
        status: "DRAFT",
        title: { en: "Private", hi: "निजी" },
      });
    await batch.commit();
  });
}

export const seedEmulator = () => seed({ kind: "emulator" });

if (process.argv[1]?.endsWith("seed.ts")) {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      "confirm-project": { type: "string" },
    },
  });
  const target = resolveTarget(values.project, values["confirm-project"]);
  seed(target)
    .then(() =>
      console.log(
        `Seeded ${describeTarget(target)} with validated placeholder catalog data.`,
      ),
    )
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
