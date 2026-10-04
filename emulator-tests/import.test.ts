import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { importManifest } from "../scripts/content/import";
import { checklist } from "../scripts/content/manifest";
import { seedEmulator } from "../scripts/emulator/seed";
import { projectId } from "../scripts/emulator/environment";
import { createFirestoreRepository } from "../src/repositories/firestoreRepository";

let env: RulesTestEnvironment;
let dir: string;
const ffmpeg = (...args: string[]) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const yes = (items: readonly string[]) => items.map(() => "yes").join(",");
const ids = [
  "import-wallpaper",
  "import-bhajan",
  "import-unknown-deity",
  "import-missing-file",
];

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  await seedEmulator(); // deities used for validation and search terms
  dir = await mkdtemp(join(tmpdir(), "bhaktara-import-test-"));
  // Synthetic inputs only: a gradient, a tone and a flat thumbnail.
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "gradients=s=1440x3200:duration=1",
    "-frames:v",
    "1",
    join(dir, "wall.png"),
  );
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "color=c=orange:s=600x600",
    "-frames:v",
    "1",
    join(dir, "thumb.png"),
  );
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=256:duration=12",
    join(dir, "song.wav"),
  );
  const visual = [...checklist.all];
  const header = [
    "importKey,type,title_hi,title_en,description_hi,description_en,deityIds,tags,audio,image,aiTool,aiPlan",
    ...visual.map((item) => `check_${item}`),
  ].join(",");
  const common = `,सुबह,"Dawn, gently",विवरण,Description`;
  const rows = [
    `import-wallpaper,WALLPAPER${common},hanuman,bajrang|anjaneya,,wall.png,Tool,Pro,${yes(visual)}`,
    // Bhajan listen-through checks are missing, so it must stay a draft.
    `import-bhajan,BHAJAN${common},krishna,shyam,song.wav,thumb.png,Tool,Pro,${yes(visual)}`,
    `import-unknown-deity,WALLPAPER${common},zeus,,,wall.png,Tool,Pro,${yes(visual)}`,
    `import-missing-file,WALLPAPER${common},hanuman,,,nope.png,Tool,Pro,${yes(visual)}`,
  ];
  await writeFile(join(dir, "manifest.csv"), [header, ...rows].join("\n"));
});

after(async () => {
  await env?.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const id of ids) {
      await deleteDoc(doc(db, "content", id));
      await deleteDoc(doc(db, "contentPrivate", id));
    }
  });
  await env?.cleanup();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const run = () =>
  importManifest({
    manifest: join(dir, "manifest.csv"),
    localMedia: join(dir, "media"),
    publishReady: true,
  });

test("manifest import validates rows, writes content, and is idempotent", async () => {
  const first = await run();
  const byKey = Object.fromEntries(
    first.map((result) => [result.importKey, result]),
  );
  assert.equal(
    byKey["import-wallpaper"].outcome,
    "created",
    byKey["import-wallpaper"].errors.join("; "),
  );
  assert.equal(byKey["import-wallpaper"].status, "PUBLISHED");
  assert.equal(
    byKey["import-bhajan"].outcome,
    "created",
    byKey["import-bhajan"].errors.join("; "),
  );
  assert.equal(byKey["import-bhajan"].status, "DRAFT");
  assert.deepEqual(byKey["import-bhajan"].missingChecks, [
    "listenThrough",
    "noUnintendedLyrics",
  ]);
  assert.match(
    byKey["import-unknown-deity"].errors.join(),
    /unknown deity zeus/,
  );
  assert.match(
    byKey["import-missing-file"].errors.join(),
    /file not found: nope.png/,
  );

  // Rules: users see only published content and never provenance records.
  const user = env
    .authenticatedContext("alice", {
      firebase: { sign_in_provider: "anonymous" },
    })
    .firestore();
  const published = await assertSucceeds(
    getDoc(doc(user, "content", "import-wallpaper")),
  );
  await assertFails(getDoc(doc(user, "content", "import-bhajan")));
  await assertFails(getDoc(doc(user, "contentPrivate", "import-wallpaper")));
  const data = published.data()!;
  assert.equal(data.title.en, "Dawn, gently");
  assert.equal(data.media.mobile.width, 1080);
  await access(join(dir, "media", data.media.mobile.key));

  // The app's repository finds it through generated search tokens. The
  // rules-testing context is the compat type; modular calls unwrap it.
  const repository = createFirestoreRepository(user as unknown as Firestore, {
    ensureSession: async () => ({ uid: "alice", isAnonymous: true }),
  });
  const found = await repository.search({ query: "anjaneya", limit: 30 });
  assert.deepEqual(
    found.items.map((item) => item.id),
    ["import-wallpaper"],
  );

  // Re-running updates in place and keeps server-owned fields.
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "content", "import-wallpaper"), {
      popularityScore: 7,
    });
  });
  const second = await run();
  assert.deepEqual(
    second
      .filter((result) => result.outcome === "updated")
      .map((result) => result.importKey),
    ["import-wallpaper", "import-bhajan"],
  );
  await env.withSecurityRulesDisabled(async (context) => {
    const after = (
      await getDoc(doc(context.firestore(), "content", "import-wallpaper"))
    ).data()!;
    assert.equal(after.popularityScore, 7);
    assert.equal(after.status, "PUBLISHED");
    assert.deepEqual(after.publishedAt, data.publishedAt);
    const provenance = (
      await getDoc(
        doc(context.firestore(), "contentPrivate", "import-wallpaper"),
      )
    ).data()!;
    assert.equal(provenance.importKey, "import-wallpaper");
    assert.ok(provenance.createdAt, "createdAt survives updates");
  });
});
