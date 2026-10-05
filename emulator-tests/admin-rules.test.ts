import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { projectId } from "../scripts/emulator/environment";
import { grantRole } from "../scripts/admin/grant-role";
import { adminRoles, AdminRole, can } from "../src/domain/cms";

// Admin CMS read rules (doc 09 §15) and the role bootstrap script. Writes to
// CMS collections stay denied for every role: they go through Functions.
let env: RulesTestEnvironment;
const ids = {
  draft: "admin-rules-draft",
  published: "admin-rules-published",
  banner: "admin-rules-inactive-banner",
  audit: "admin-rules-audit",
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "content", ids.draft), {
      status: "DRAFT",
      type: "BHAJAN",
      updatedAt: new Date(),
    });
    await setDoc(doc(db, "content", ids.published), {
      status: "PUBLISHED",
      type: "BHAJAN",
      updatedAt: new Date(),
    });
    await setDoc(doc(db, "contentPrivate", ids.draft), { sourceText: "x" });
    await setDoc(doc(db, "banners", ids.banner), { isActive: false });
    await setDoc(doc(db, "auditLogs", ids.audit), {
      adminUid: "someone",
      action: "content.create",
      createdAt: new Date(),
    });
  });
});

after(async () => {
  await env?.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await deleteDoc(doc(db, "content", ids.draft));
    await deleteDoc(doc(db, "content", ids.published));
    await deleteDoc(doc(db, "contentPrivate", ids.draft));
    await deleteDoc(doc(db, "banners", ids.banner));
    await deleteDoc(doc(db, "auditLogs", ids.audit));
  });
  await env?.cleanup();
});

const as = (
  role: AdminRole | null,
  provider: "google.com" | "anonymous" = "google.com",
) =>
  env
    .authenticatedContext(`uid-${role ?? "none"}-${provider}`, {
      ...(role ? { role } : {}),
      firebase: { sign_in_provider: provider },
    })
    .firestore();

test("staff reads follow the role table; everyone else is denied", async () => {
  for (const role of [...adminRoles, null]) {
    const db = as(role);
    const expect = (allowed: boolean, operation: Promise<unknown>) =>
      allowed ? assertSucceeds(operation) : assertFails(operation);
    const contentStaff = can(role, "content.read");
    const contentAdmin = can(role, "audit.read");
    assert.equal(can(role, "banner.read"), contentAdmin);
    await expect(contentStaff, getDoc(doc(db, "content", ids.draft)));
    await expect(
      contentStaff,
      getDocs(
        query(
          collection(db, "content"),
          where("status", "==", "DRAFT"),
          orderBy("updatedAt", "desc"),
          limit(50),
        ),
      ),
    );
    await expect(contentStaff, getDoc(doc(db, "contentPrivate", ids.draft)));
    await expect(contentAdmin, getDoc(doc(db, "banners", ids.banner)));
    assert.equal(can(role, "home.read"), contentAdmin);
    await expect(contentAdmin, getDoc(doc(db, "homeLayout", "en")));
    await assertFails(getDocs(query(collection(db, "homeLayout"), limit(2))));
    await expect(
      contentAdmin,
      getDocs(
        query(
          collection(db, "auditLogs"),
          orderBy("createdAt", "desc"),
          limit(50),
        ),
      ),
    );
    // Lists stay bounded, even for staff.
    await assertFails(getDocs(collection(db, "content")));
    await assertFails(getDocs(query(collection(db, "auditLogs"), limit(101))));
  }
});

test("role claims on anonymous or signed-out sessions grant nothing", async () => {
  const forged = as("SUPER_ADMIN", "anonymous");
  await assertFails(getDoc(doc(forged, "content", ids.draft)));
  await assertFails(getDoc(doc(forged, "auditLogs", ids.audit)));
  const signedOut = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(signedOut, "contentPrivate", ids.draft)));
  // Public catalog rules are unchanged for guests.
  const guest = as(null, "anonymous");
  await assertSucceeds(getDoc(doc(guest, "content", ids.published)));
  await assertFails(getDoc(doc(guest, "content", ids.draft)));
});

test("no role can write CMS collections directly", async () => {
  for (const role of adminRoles) {
    const db = as(role);
    await assertFails(
      updateDoc(doc(db, "content", ids.draft), { status: "PUBLISHED" }),
    );
    await assertFails(
      setDoc(doc(db, "content", "new-item"), { status: "DRAFT" }),
    );
    await assertFails(setDoc(doc(db, "contentPrivate", ids.draft), {}));
    await assertFails(
      setDoc(doc(db, "banners", "new-banner"), { isActive: true }),
    );
    await assertFails(deleteDoc(doc(db, "banners", ids.banner)));
    await assertFails(setDoc(doc(db, "homeLayout", "en"), { sections: [] }));
    await assertFails(setDoc(doc(db, "homeFeeds", "en"), { sections: [] }));
    await assertFails(setDoc(doc(db, "jobState", "buildHomeFeed"), {}));
    await assertFails(setDoc(doc(db, "auditLogs", "forged"), { action: "x" }));
    await assertFails(deleteDoc(doc(db, "auditLogs", ids.audit)));
  }
});

test("grant-role sets and clears the claim on the emulator and audits it", async () => {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  const email = "grant-role@cms.test";
  const granted = await grantRole({
    target: { kind: "emulator" },
    email,
    role: "EDITOR",
    create: true,
    operator: "test",
  });
  assert.equal(granted.previous, null);
  const app = initializeApp({ projectId }, `grant-role-test-${Date.now()}`);
  try {
    const auth = getAuth(app);
    assert.equal(
      (await auth.getUser(granted.uid)).customClaims?.role,
      "EDITOR",
    );
    await grantRole({
      target: { kind: "emulator" },
      email,
      role: null,
      operator: "test",
    });
    assert.equal(
      (await auth.getUser(granted.uid)).customClaims?.role,
      undefined,
    );
    await auth.deleteUser(granted.uid);
  } finally {
    await deleteApp(app);
  }
  await env.withSecurityRulesDisabled(async (context) => {
    const entries = await getDocs(
      query(
        collection(context.firestore(), "auditLogs"),
        where("entityId", "==", granted.uid),
      ),
    );
    const roles = entries.docs
      .map((entry) => entry.data())
      .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
      .map((entry) => [entry.adminUid, entry.afterSummary.role]);
    assert.deepEqual(roles, [
      ["script:test", "EDITOR"],
      ["script:test", null],
    ]);
    for (const entry of entries.docs) await deleteDoc(entry.ref);
  });
  // Real projects are never touched without a confirmed target.
  await assert.rejects(
    grantRole({
      target: { kind: "project", projectId: "bhaktara-dev" },
      email,
      role: "EDITOR",
      create: true,
    }),
    /Unset FIREBASE_AUTH_EMULATOR_HOST/,
  );
});
