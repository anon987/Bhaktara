import { doc, setDoc, Timestamp } from "firebase/firestore";
import { fixtures } from "../../src/repositories/fixtures";
import {
  publishedContentSchema,
  deityDocumentSchema,
  bannerDocumentSchema,
} from "../../src/repositories/firestoreSchemas";
import { buildSearchTokens } from "../../src/domain/search";
import { emulatorEnvironment } from "./environment";

export async function seedEmulator() {
  const environment = await emulatorEnvironment();
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
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
        await setDoc(doc(db, "content", id), value);
      }
      for (const [index, deity] of fixtures.deities.entries()) {
        const value = {
          name: deity.name,
          isActive: true,
          isMandirEnabled: true,
          sortOrder: index,
          aliases: [],
          description: { en: "Emulator placeholder", hi: "एमुलेटर उदाहरण" },
          media: { thumb: { key: deity.artKey } },
          mandirArt: { mobile: { key: deity.artKey } },
        };
        deityDocumentSchema.parse(value);
        await setDoc(doc(db, "deities", deity.id), value);
      }
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
        await setDoc(doc(db, "banners", banner.id), value);
      }
      // A private draft verifies that clients cannot accidentally expose it.
      await setDoc(doc(db, "content", "private-draft"), {
        status: "DRAFT",
        title: { en: "Private", hi: "निजी" },
      });
    });
  } finally {
    await environment.cleanup();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seedEmulator()
    .then(() =>
      console.log(
        "Seeded demo-bhaktara with validated placeholder catalog data.",
      ),
    )
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
