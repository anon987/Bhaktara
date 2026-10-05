import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
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
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { createFirestoreFavoritesRepository } from "../src/repositories/favoritesRepository";
import { isPermanentError } from "../src/repositories/firestoreErrors";
import { jsFirestoreApi } from "../src/services/firebase/jsFirestoreApi";
import { createSessionService } from "../src/services/auth/session";
import { createFavoritesSync } from "../src/services/favorites/sync";
import {
  FavoritesSyncState,
  initialFavoritesSyncState,
} from "../src/services/favorites/syncStore";
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
});
after(async () => {
  await env?.cleanup();
});
const guest = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();
const favorite = (contentId: string, type: string) => ({
  contentId,
  type,
  createdAt: serverTimestamp(),
});

test("owners create, read and delete their favorites; others cannot", async () => {
  const carol = guest("carol");
  const path = "users/carol/favorites/aarti-1";
  await assertSucceeds(setDoc(doc(carol, path), favorite("aarti-1", "AARTI")));
  await assertSucceeds(getDoc(doc(carol, path)));
  await assertSucceeds(getDocs(collection(carol, "users/carol/favorites")));
  // Create-only: an existing favorite is never overwritten or edited.
  await assertFails(setDoc(doc(carol, path), favorite("aarti-1", "AARTI")));
  await assertFails(updateDoc(doc(carol, path), { type: "AARTI" }));
  const dave = guest("dave");
  await assertFails(getDoc(doc(dave, path)));
  await assertFails(getDocs(collection(dave, "users/carol/favorites")));
  await assertFails(deleteDoc(doc(dave, path)));
  await assertFails(
    setDoc(
      doc(env.unauthenticatedContext().firestore(), path),
      favorite("aarti-1", "AARTI"),
    ),
  );
  await assertSucceeds(deleteDoc(doc(carol, path)));
  // Deleting a missing favorite is allowed, so removals are idempotent.
  await assertSucceeds(deleteDoc(doc(carol, path)));
});

test("favorites reject drafts, unknown IDs, wrong types and extra fields", async () => {
  const carol = guest("carol");
  await assertFails(
    setDoc(
      doc(carol, "users/carol/favorites/private-draft"),
      favorite("private-draft", "BHAJAN"),
    ),
  );
  await assertFails(
    setDoc(
      doc(carol, "users/carol/favorites/missing-1"),
      favorite("missing-1", "BHAJAN"),
    ),
  );
  await assertFails(
    setDoc(
      doc(carol, "users/carol/favorites/bhajan-1"),
      favorite("bhajan-1", "AARTI"),
    ),
  );
  await assertFails(
    setDoc(doc(carol, "users/carol/favorites/bhajan-1"), {
      ...favorite("bhajan-1", "BHAJAN"),
      createdAt: new Date(0),
    }),
  );
  await assertFails(
    setDoc(doc(carol, "users/carol/favorites/bhajan-1"), {
      ...favorite("bhajan-1", "BHAJAN"),
      note: "extra",
    }),
  );
});

async function anonymousClient(name: string) {
  const app = initializeApp(
    { projectId, apiKey: "demo-api-key", appId: "test" },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const session = createSessionService({
    ready: () => auth.authStateReady(),
    current: () => auth.currentUser,
    createAnonymous: async () => (await signInAnonymously(auth)).user,
  });
  const user = await session.ensureSession();
  assert.ok(user?.isAnonymous);
  return {
    app,
    uid: user.uid,
    repository: createFirestoreFavoritesRepository(db, session, jsFirestoreApi),
  };
}

test("repository adds idempotently and lists newest first across pages", async () => {
  const { app, repository } = await anonymousClient("favorites-repo");
  try {
    const ids = ["bhajan-1", "aarti-1", "mantra-1", "chalisa-1", "wallpaper-1"];
    for (const id of ids) await repository.add(id);
    // Re-adding (a retried write) resolves without changing anything.
    await repository.add("aarti-1", "AARTI");
    await repository.add("bhajan-1");
    // A stale type hint is corrected from the published content.
    await repository.add("ringtone-1", "BHAJAN");
    const listed: string[] = [];
    const types = new Map<string, string>();
    let cursor: string | undefined;
    do {
      const page = await repository.list({ limit: 2, cursor });
      assert.ok(page.items.length <= 2);
      page.items.forEach((item) => {
        listed.push(item.contentId);
        types.set(item.contentId, item.type);
      });
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(listed, ["ringtone-1", ...[...ids].reverse()]);
    assert.equal(types.get("ringtone-1"), "RINGTONE");
    assert.equal(types.get("chalisa-1"), "CHALISA");

    await repository.remove("mantra-1");
    await repository.remove("mantra-1");
    assert.deepEqual(
      (await repository.list({ limit: 50 })).items.map(
        (item) => item.contentId,
      ),
      ["ringtone-1", "wallpaper-1", "chalisa-1", "aarti-1", "bhajan-1"],
    );

    for (const id of ["private-draft", "missing-1"]) {
      const error = await repository.add(id).then(
        () => assert.fail(`${id} must be rejected`),
        (value: unknown) => value,
      );
      assert.ok(isPermanentError(error), `${id}: ${String(error)}`);
    }
    await assert.rejects(repository.add("bad/id"));
  } finally {
    await deleteApp(app);
  }
});

test("sync migrates device favorites once, keeping only published content", async () => {
  const { app, uid, repository } = await anonymousClient("favorites-sync");
  try {
    let saved: FavoritesSyncState = initialFavoritesSyncState;
    const store = {
      read: async () => saved,
      write: async (state: FavoritesSyncState) => {
        saved = state;
      },
    };
    let device = ["chalisa-1", "private-draft", "missing-1", "aarti-1"];
    const apply = (update: (ids: string[]) => string[]) => {
      device = update(device);
    };
    const sync = createFavoritesSync({ repository, store, apply });
    await sync.start(uid, device);
    sync.stop();
    assert.deepEqual(device, ["aarti-1", "chalisa-1"]);
    assert.deepEqual(saved.migrated, [uid]);
    assert.deepEqual(saved.queue, []);

    // A second launch does not re-add device favorites removed elsewhere.
    await repository.remove("chalisa-1");
    const again = createFavoritesSync({ repository, store, apply });
    await again.start(uid, ["chalisa-1", "aarti-1"]);
    await again.setFavorite("bhajan-1", true, "BHAJAN");
    await again.flush();
    await again.refresh({ force: true });
    again.stop();
    assert.deepEqual(device, ["bhajan-1", "aarti-1"]);
  } finally {
    await deleteApp(app);
  }
});
