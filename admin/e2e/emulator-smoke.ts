// End-to-end smoke test of the admin app's data layer against the local
// emulators (auth, firestore, functions; project demo-bhaktara). It drives
// the same firebaseApi and readableError code the screens use: role gate,
// content create/update/transition with checklist errors, banners, the audit
// log, uploads without R2 config, and role refusals.
//
//   npm run admin:smoke     (starts the emulators via emulators:exec)
import assert from "node:assert/strict";
import { signInWithCredential, GoogleAuthProvider, signOut } from "firebase/auth";
import { firebaseApi } from "../src/api";
import { readConfig } from "../src/config";
import type { ContentDraftInput } from "../src/domain";
import { applicableChecks } from "../src/domain";
import { readableError } from "../src/errors";
import { createFirebase } from "../src/firebase";

const config = readConfig({});
const { projectId } = config.firebase;
const host = config.emulators!.host;
const authBase = `http://${host}:${config.emulators!.authPort}`;
const firestoreBase = `http://${host}:${config.emulators!.firestorePort}`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };

const services = createFirebase(config);
const api = firebaseApi(services);
const step = (text: string) => console.log(`✓ ${text}`);

async function expectError(promise: Promise<unknown>, kind: string) {
  try {
    await promise;
  } catch (error) {
    const readable = readableError(error);
    assert.equal(readable.kind, kind, `${readable.title}: ${readable.message}`);
    return readable;
  }
  assert.fail(`expected a ${kind} error`);
}

// Emulator-only admin helpers ("Bearer owner" bypasses rules and auth).
async function seedDeity(id: string, en: string, hi: string) {
  const response = await fetch(
    `${firestoreBase}/v1/projects/${projectId}/databases/(default)/documents/deities?documentId=${id}`,
    {
      method: "POST",
      headers: owner,
      body: JSON.stringify({
        fields: {
          name: { mapValue: { fields: { en: { stringValue: en }, hi: { stringValue: hi } } } },
          isActive: { booleanValue: true },
          aliases: { arrayValue: {} },
        },
      }),
    },
  );
  assert.ok(response.ok || response.status === 409, `seed deity: ${response.status}`);
}
async function setRole(uid: string, role: string | null) {
  const response = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: "POST",
      headers: owner,
      body: JSON.stringify({
        localId: uid,
        customAttributes: JSON.stringify(role ? { role } : {}),
      }),
    },
  );
  assert.ok(response.ok, `set role: ${response.status}`);
}
async function signInAs(email: string, role: string | null) {
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ sub: email, email, email_verified: true }),
  );
  const { user } = await signInWithCredential(services.auth, credential);
  await setRole(user.uid, role);
  const token = await user.getIdTokenResult(true);
  return { user, role: token.claims.role ?? null };
}

const id = `smoke-${Date.now().toString(36)}`;
const incomplete: ContentDraftInput = {
  type: "BHAJAN",
  title: { hi: "", en: "Smoke bhajan" },
  description: { hi: "", en: "" },
  deityIds: ["hanuman"],
  categoryIds: [],
  tags: ["smoke"],
  media: {},
  isFeatured: false,
  saveGate: "FREE",
  isShareable: true,
  adEligible: true,
  private: { checklist: {} },
};
const complete: ContentDraftInput = {
  ...incomplete,
  title: { hi: "स्मोक भजन", en: "Smoke bhajan" },
  description: { hi: "परीक्षण", en: "Emulator smoke test item" },
  audioLanguage: "hi",
  durationSeconds: 180,
  media: {
    thumb: { key: `bhajan/${id}/thumb.abcd1234.webp` },
    stream: { key: `bhajan/${id}/stream.abcd1234.m4a` },
  },
  private: {
    aiTool: "test-tool",
    aiPlan: "test-plan",
    checklist: Object.fromEntries(applicableChecks("BHAJAN").map((item) => [item, true])),
  },
};

async function main() {
  await seedDeity("hanuman", "Hanuman", "हनुमान");

  // Role gate: no claim → no access, and Firestore refuses staff reads.
  const guest = await signInAs("no-role@example.com", null);
  assert.equal(guest.role, null);
  await expectError(api.listContent({ pageSize: 5 }), "permission");
  step("account without a role claim is refused (no-access state)");

  const admin = await signInAs("operator@example.com", "SUPER_ADMIN");
  assert.equal(admin.role, "SUPER_ADMIN");
  step("role claim read after Refresh access (SUPER_ADMIN)");

  const created = await api.createContent(id, incomplete);
  assert.equal(created.status, "DRAFT");
  assert.ok(created.problems.length > 0);
  step(`createContent ${id} → DRAFT with ${created.problems.length} readiness problems`);

  const refused = await expectError(api.transitionContent({ contentId: id, to: "READY" }), "checklist");
  assert.ok(refused.problems.some((problem) => problem.field === "title.hi"));
  step(`DRAFT → READY refused with ${refused.problems.length} readable problems`);

  const invalid = await expectError(
    api.updateContent(id, { ...complete, deityIds: ["not-a-deity"] }),
    "invalid",
  );
  assert.match(invalid.problems[0].message, /unknown deity/);
  step("server field errors surface as problems (unknown deity)");

  const saved = await api.updateContent(id, complete);
  assert.deepEqual(saved.problems, []);
  const record = await api.getContent(id);
  assert.equal(record?.draft.private.aiTool, "test-tool");
  step("updateContent saves a complete draft; getContent reads it back with private fields");

  await expectError(
    api.transitionContent({ contentId: id, to: "SCHEDULED" }),
    "invalid-transition",
  );
  await api.transitionContent({ contentId: id, to: "READY" });
  await expectError(api.transitionContent({ contentId: id, to: "SCHEDULED" }), "schedule");
  await api.transitionContent({ contentId: id, to: "PUBLISHED" });
  assert.equal((await api.getContent(id))?.status, "PUBLISHED");
  step("DRAFT → READY → PUBLISHED, with invalid-move and schedule errors explained");

  const published = await api.listContent({ status: "PUBLISHED", type: "BHAJAN", pageSize: 100 });
  assert.ok(published.items.some((item) => item.id === id));
  const firstPage = await api.listContent({ pageSize: 1 });
  assert.equal(firstPage.items.length, 1);
  if (firstPage.next) {
    const second = await api.listContent({ pageSize: 1, after: firstPage.next });
    assert.notEqual(second.items[0]?.id, firstPage.items[0].id);
  }
  step("content list filters by status/type and paginates");

  await expectError(api.requestUploadUrl({ contentId: id, contentType: "image/png", bytes: 1000 }), "uploads-unconfigured");
  step("requestUploadUrl without R2 settings shows the not-configured message");

  const now = Date.now();
  const banner = {
    title: { hi: "स्मोक", en: "Smoke banner" },
    subtitle: { hi: "", en: "" },
    ctaText: { hi: "खोलें", en: "Open" },
    image: { mobile: { key: "banners/smoke/mobile.abcd1234.webp" } },
    target: { route: "explore" as const },
    priority: 5,
    startAt: new Date(now - 60_000).toISOString(),
    endAt: new Date(now + 86_400_000).toISOString(),
    isActive: true,
    languages: ["hi", "en"] as ("hi" | "en")[],
  };
  const { id: bannerId } = await api.createBanner(banner);
  await api.updateBanner(bannerId, { ...banner, priority: 7, isActive: false });
  const banners = await api.listBanners();
  const stored = banners.find((item) => item.id === bannerId);
  assert.equal(stored?.banner.priority, 7);
  assert.equal(stored?.banner.startAt, banner.startAt);
  await api.deleteBanner(bannerId);
  assert.ok(!(await api.listBanners()).some((item) => item.id === bannerId));
  step("banner create → list → update → delete");

  const audit = await api.listAudit({ pageSize: 3 });
  assert.equal(audit.items.length, 3);
  assert.equal(audit.items[0].action, "banner.delete");
  assert.equal(audit.items[0].entityId, bannerId);
  assert.ok(audit.next);
  const older = await api.listAudit({ pageSize: 3, after: audit.next });
  assert.ok(older.items.length > 0);
  assert.ok((older.items[0].createdAt ?? "") <= (audit.items[2].createdAt ?? ""));
  step("audit log newest first, paginated");

  await signOut(services.auth);
  await signInAs("editor@example.com", "EDITOR");
  const denied = await expectError(
    api.transitionContent({ contentId: id, to: "ARCHIVED" }),
    "permission",
  );
  assert.match(denied.message, /EDITOR/);
  await expectError(api.listBanners(), "permission");
  await expectError(api.listAudit({ pageSize: 5 }), "permission");
  assert.ok((await api.listContent({ pageSize: 5 })).items.length > 0);
  step("EDITOR: reads content, cannot archive, banners and audit are refused");

  await signOut(services.auth);
  console.log("Admin emulator smoke test passed.");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
