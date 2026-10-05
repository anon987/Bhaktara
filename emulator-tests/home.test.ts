import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { createFirestoreRepository } from "../src/repositories/firestoreRepository";
import { jsFirestoreApi } from "../src/services/firebase/jsFirestoreApi";
import { createSessionService } from "../src/services/auth/session";
import { seedEmulator } from "../scripts/emulator/seed";
import { projectId } from "../scripts/emulator/environment";

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  await seedEmulator();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "homeLayout", "en"), {
      sections: [],
    });
  });
});
after(async () => {
  // Leave the emulator with the canonical seeded feeds for later files.
  await seedEmulator();
  await env?.cleanup();
});
const guest = () =>
  env
    .authenticatedContext("alice", {
      firebase: { sign_in_provider: "anonymous" },
    })
    .firestore();
// Stands in for server writes (buildHomeFeed) with rules bypassed.
const admin = (
  write: (db: ReturnType<RulesTestContext["firestore"]>) => Promise<unknown>,
) =>
  env.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore());
  });

test("home feeds are readable by sessions, never listed or written by clients", async () => {
  const db = guest();
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "homeFeeds", "en")),
  );
  await assertSucceeds(getDoc(doc(db, "homeFeeds", "en")));
  await assertSucceeds(getDoc(doc(db, "homeFeeds", "hi")));
  await assertFails(getDoc(doc(db, "homeFeeds", "fr")));
  await assertFails(getDocs(query(collection(db, "homeFeeds"), limit(2))));
  await assertFails(
    getDocs(
      query(
        collection(db, "homeFeeds"),
        where("isPublished", "==", true),
        limit(2),
      ),
    ),
  );
  const signed = env
    .authenticatedContext("signed", {
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  for (const client of [db, signed]) {
    await assertFails(
      setDoc(doc(client, "homeFeeds", "en"), {
        language: "en",
        isPublished: true,
        sections: [],
      }),
    );
    await assertFails(
      updateDoc(doc(client, "homeFeeds", "en"), { sections: [] }),
    );
    await assertFails(deleteDoc(doc(client, "homeFeeds", "en")));
    await assertFails(setDoc(doc(client, "homeFeeds", "new"), { a: 1 }));
  }
  // The CMS source layout is admin-only.
  await assertFails(getDoc(doc(db, "homeLayout", "en")));
  await assertFails(setDoc(doc(db, "homeLayout", "en"), { sections: [] }));
});

test("unpublished home feeds are hidden and missing ones read as absent", async () => {
  const db = guest();
  await admin((store) =>
    updateDoc(doc(store, "homeFeeds", "en"), { isPublished: false }),
  );
  await assertFails(getDoc(doc(db, "homeFeeds", "en")));
  await admin((store) => deleteDoc(doc(store, "homeFeeds", "en")));
  const missing = await assertSucceeds(getDoc(doc(db, "homeFeeds", "en")));
  assert.equal(missing.exists(), false);
  await seedEmulator();
});

test("repository reads one ordered, language-specific home feed", async () => {
  const app = initializeApp(
    { projectId, apiKey: "demo-api-key", appId: "test" },
    "home-integration",
  );
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    const session = createSessionService({
      ready: () => auth.authStateReady(),
      current: () => auth.currentUser,
      createAnonymous: async () => (await signInAnonymously(auth)).user,
    });
    const repository = createFirestoreRepository(db, session, jsFirestoreApi);

    const en = await repository.getHome("en");
    assert.ok(en);
    assert.equal(en.language, "en");
    assert.deepEqual(
      en.banners.map((banner) => banner.id),
      ["morning", "mandir"],
    );
    // The hidden "bhajans" rail is left out by the feed builder.
    assert.deepEqual(
      en.sections.map((section) => section.id),
      [
        "progress",
        "shortcuts",
        "sadhana",
        "trending",
        "aarti-sangrah",
        "quote",
      ],
    );
    const aarti = en.sections.find((section) => section.id === "aarti-sangrah");
    assert.equal(aarti?.type, "RAIL");
    if (aarti?.type === "RAIL") {
      assert.deepEqual(
        aarti.items.map((item) => item.id),
        [
          "aarti-1",
          "aarti-krishna",
          "aarti-ganesha",
          "aarti-hanuman",
          "aarti-durga",
        ],
      );
      // Card-level fields only.
      assert.deepEqual(Object.keys(aarti.items[0]).sort(), [
        "durationSeconds",
        "id",
        "media",
        "title",
        "type",
      ]);
      assert.equal(aarti.title.hi, "आरती संग्रह");
    }
    const hi = await repository.getHome("hi");
    assert.deepEqual(
      hi?.sections.map((section) => section.id),
      [
        "sadhana",
        "shortcuts",
        "aarti-sangrah",
        "trending",
        "progress",
        "quote",
      ],
    );

    // Forward compatibility: unknown types, hidden, malformed and expired
    // entries are skipped, and `order` wins over array position.
    await admin(async (store) => {
      const snapshot = await getDoc(doc(store, "homeFeeds", "en"));
      const value = snapshot.data()!;
      await setDoc(doc(store, "homeFeeds", "en"), {
        ...value,
        banners: [
          ...value.banners,
          { ...value.banners[0], id: "expired", endAt: value.generatedAt },
        ],
        sections: [
          { id: "future", type: "HOROSCOPE_WALL", order: 1, visible: true },
          {
            id: "quote",
            type: "QUOTE",
            order: 5,
            visible: true,
            text: value.sections.at(-1).text,
          },
          { id: "sadhana", type: "SADHANA", order: 2, visible: true },
          { id: "hidden", type: "PROGRESS", order: 3, visible: false },
          { id: "broken", type: "RAIL", order: 4, visible: true },
          { id: "league", type: "LEAGUE", order: 0, visible: true },
        ],
      });
    });
    const updated = await repository.getHome("en");
    assert.deepEqual(
      updated?.sections.map((section) => section.id),
      ["sadhana", "quote"],
    );
    assert.deepEqual(
      updated?.banners.map((banner) => banner.id),
      ["morning", "mandir"],
    );

    await admin((store) =>
      updateDoc(doc(store, "homeFeeds", "en"), { isPublished: false }),
    );
    await assert.rejects(repository.getHome("en"));
    await admin((store) => deleteDoc(doc(store, "homeFeeds", "hi")));
    assert.equal(await repository.getHome("hi"), null);
    await assert.rejects(repository.getHome("fr" as never));
  } finally {
    await deleteApp(app);
    await seedEmulator();
  }
});
