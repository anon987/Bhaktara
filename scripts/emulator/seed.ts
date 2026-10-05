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
import {
  buildHomeFeedSections,
  HomeBannerSource,
  HomeCardSource,
  homeLanguages,
  homeLayoutSectionsSchema,
  resolveHomeBanners,
} from "../../src/domain/home";
import { buildSearchTokens } from "../../src/domain/search";
import {
  describeTarget,
  FirestoreTarget,
  resolveTarget,
  withFirestore,
} from "../firebase/target";
import { seedProgression } from "../progression/seed";

// Validated placeholder catalog: deities, banners, sample content, the Home
// layouts and collections, and the precomputed Home feeds. These are
// synthetic development records, never reviewed launch content.
const seedEpoch = Date.UTC(2026, 8, 1);
export async function seed(target: FirestoreTarget) {
  await withFirestore(target, async (db) => {
    const batch = db.batch();
    const cards: HomeCardSource[] = [];
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
      // Fixed, distinct publish times so `sort: NEW` rails are deterministic.
      const publishedAt = seedEpoch - index * 3600000;
      batch.set(db.collection("content").doc(id), {
        ...value,
        publishedAt: Timestamp.fromMillis(publishedAt),
      });
      cards.push({
        ...item,
        popularityScore: value.popularityScore,
        publishedAt,
      });
    }
    // Published editorial collections referenced by the fixture layouts.
    for (const [index, collection] of homeCollections.entries()) {
      const rail = homeLayouts.en.find(
        (section) => section.source?.collectionId === collection.id,
      );
      const cover = fixtures.content.find(
        (item) => item.id === collection.itemIds[0],
      );
      batch.set(db.collection("collections").doc(collection.id), {
        title: rail?.title ?? { en: collection.id, hi: collection.id },
        description: { en: "Placeholder collection", hi: "उदाहरण संग्रह" },
        cover: { thumb: cover?.media.thumb ?? { key: "placeholder/om" } },
        itemIds: collection.itemIds,
        isFeatured: false,
        isPublished: true,
        sortOrder: index,
      });
    }
    // The CMS source layouts (admin-only), validated like the Home manager.
    for (const language of homeLanguages)
      batch.set(db.collection("homeLayout").doc(language), {
        sections: homeLayoutSectionsSchema.parse(homeLayouts[language]),
        revision: 1,
        updatedAt: Timestamp.now(),
        updatedBy: "seed",
      });
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
    const homeBanners: HomeBannerSource<Timestamp>[] = [];
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
      homeBanners.push({ id: banner.id, ...value });
    }
    // Same pure builder as the `buildHomeFeed` function (doc 08), so a
    // rebuild of the seeded sources reproduces these feeds exactly
    // (functions/test/home.test.ts checks it).
    const now = Date.now();
    for (const language of homeLanguages) {
      const sections = JSON.parse(
        JSON.stringify(
          buildHomeFeedSections(homeLayouts[language], cards, homeCollections),
        ),
      );
      const banners = resolveHomeBanners(homeBanners, language, now);
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
  // Habit-layer config, badges and development challenges (doc 10).
  await seedProgression(target);
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
