// Unit tests for the Mandir decor rules in the catalogue and the sound
// assets (bell rings) stored as uploaded. No emulator, network or R2: the
// store is an in-memory fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpsError } from "firebase-functions/v2/https";
import {
  processAssetSchema,
  requestAssetUploadSchema,
} from "../../../src/domain/admin";
import { AudioStore, promoteAudio, sniffAudio } from "../../src/audioAssets";
import { checkMandirOffering } from "../../src/catalog";

const art = { mobile: { key: "deity/x/mobile.0123abcd.webp" } };
const base = {
  name: { en: "Item", hi: "वस्तु" },
  deityIds: [],
  unlock: "FREE",
  sortOrder: 0,
  isActive: true,
  art,
};

function refused(run: () => void, reason: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof HttpsError, String(error));
    assert.equal((error.details as { reason?: string }).reason, reason);
    return true;
  });
}

test("decor fields belong to their kind only", () => {
  const stage = { x: 0.3, y: 0.4, width: 0.4, height: 0.4 };
  const sound = { audio: { key: "sound/a/file.0123abcd.m4a" } };
  checkMandirOffering({ ...base, kind: "temple", stage });
  checkMandirOffering({ ...base, kind: "bell", sound });
  checkMandirOffering({ ...base, kind: "light", placement: "sides" });
  checkMandirOffering({ ...base, kind: "flower", flowerKind: "lotus" });
  checkMandirOffering({ ...base, kind: "diya" });
  refused(() => checkMandirOffering({ ...base, kind: "light", stage }), "FIELD_NOT_FOR_KIND");
  refused(() => checkMandirOffering({ ...base, kind: "temple", sound }), "FIELD_NOT_FOR_KIND");
  refused(() => checkMandirOffering({ ...base, kind: "bell", placement: "top" }), "FIELD_NOT_FOR_KIND");
  refused(
    () => checkMandirOffering({ ...base, kind: "garland", flowerKind: "rose" }),
    "FIELD_NOT_FOR_KIND",
  );
});

test("active temples, lights and bells need their image", () => {
  for (const kind of ["temple", "light", "bell"]) {
    refused(() => checkMandirOffering({ ...base, kind, art: undefined }), "ART_REQUIRED");
    checkMandirOffering({ ...base, kind, art: undefined, isActive: false });
  }
  // Older offering kinds keep working without art.
  checkMandirOffering({ ...base, kind: "flower", art: undefined });
});

test("a flower forbidden for a listed deity is refused", () => {
  refused(
    () => checkMandirOffering({ ...base, kind: "flower", flowerKind: "tulsi", deityIds: ["krishna", "shiva"] }),
    "FORBIDDEN_OFFERING",
  );
  refused(
    () => checkMandirOffering({ ...base, kind: "flower", flowerKind: "durva", deityIds: ["lakshmi"] }),
    "FORBIDDEN_OFFERING",
  );
  checkMandirOffering({ ...base, kind: "flower", flowerKind: "tulsi", deityIds: ["krishna", "vishnu"] });
  // Empty deityIds: every deity; the app leaves it out where it is forbidden.
  checkMandirOffering({ ...base, kind: "flower", flowerKind: "tulsi", deityIds: [] });
});

test("sound uploads: M4A or MP3, at most 1 MB, only for sounds", () => {
  const ok = { purpose: "sound", label: "Bell", contentType: "audio/mp4", bytes: 40_000 };
  assert.ok(requestAssetUploadSchema.safeParse(ok).success);
  assert.ok(requestAssetUploadSchema.safeParse({ ...ok, contentType: "audio/mpeg" }).success);
  assert.ok(!requestAssetUploadSchema.safeParse({ ...ok, bytes: 1024 * 1024 + 1 }).success);
  assert.ok(!requestAssetUploadSchema.safeParse({ ...ok, contentType: "audio/wav" }).success);
  assert.ok(!requestAssetUploadSchema.safeParse({ ...ok, contentType: "image/png" }).success);
  assert.ok(!requestAssetUploadSchema.safeParse({ ...ok, purpose: "decor" }).success);
  // Images are unchanged.
  assert.ok(
    requestAssetUploadSchema.safeParse({ purpose: "temple", label: "T", contentType: "image/webp", bytes: 9_000_000 }).success,
  );
  assert.ok(processAssetSchema.safeParse({ assetId: "sound-1", audio: "staging/x" }).success);
  assert.ok(processAssetSchema.safeParse({ assetId: "deity-1", image: "staging/x" }).success);
  assert.ok(!processAssetSchema.safeParse({ assetId: "deity-1" }).success);
  assert.ok(!processAssetSchema.safeParse({ assetId: "d", image: "a", audio: "b" }).success);
});

test("sniffs M4A and MP3 from their first bytes", () => {
  const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));
  assert.equal(sniffAudio(bytes("\0\0\0\x20ftypM4A ")), "audio/mp4");
  assert.equal(sniffAudio(bytes("ID3\x04\0\0")), "audio/mpeg");
  assert.equal(sniffAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), "audio/mpeg");
  assert.equal(sniffAudio(bytes("RIFF\0\0\0\0WAVE")), null);
  assert.equal(sniffAudio(bytes("\x89PNG\r\n")), null);
});

function fakeStore(objects: Record<string, { body: Uint8Array; etag?: string }>) {
  const copies: [string, string, string][] = [];
  const store: AudioStore = {
    async head(key) {
      const object = objects[key];
      return object ? { bytes: object.body.length, etag: object.etag } : null;
    },
    async readStart(key, bytes) {
      return objects[key].body.slice(0, bytes);
    },
    async copy(from, to, contentType) {
      copies.push([from, to, contentType]);
    },
  };
  return { store, copies };
}

test("a staged sound is checked and copied to a content-addressed key", async () => {
  const staging = "staging/sound-0a1b2c3d/0b6f2a9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.m4a";
  const m4a = new Uint8Array(4096);
  m4a.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]);
  const { store, copies } = fakeStore({
    [staging]: { body: m4a, etag: '"9e107d9d372bb6826bd81d3542a419d6"' },
  });
  const variant = await promoteAudio({ assetId: "sound-0a1b2c3d", stagingKey: staging, contentType: "audio/mp4", store });
  assert.deepEqual(variant, {
    key: "sound/sound-0a1b2c3d/file.9e107d9d.m4a",
    bytes: 4096,
    mime: "audio/mp4",
  });
  assert.deepEqual(copies, [[staging, variant.key, "audio/mp4"]]);
});

test("a sound that is missing, too large or not what it claims is refused", async () => {
  const staging = "staging/sound-1/0b6f2a9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.m4a";
  const reason = async (promise: Promise<unknown>, expected: string) =>
    assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof HttpsError);
      assert.equal((error.details as { reason?: string })?.reason, expected);
      return true;
    });
  await reason(
    promoteAudio({ assetId: "sound-1", stagingKey: staging, contentType: "audio/mp4", store: fakeStore({}).store }),
    "NOT_FOUND",
  );
  const big = fakeStore({ [staging]: { body: new Uint8Array(1024 * 1024 + 1) } });
  await reason(promoteAudio({ assetId: "sound-1", stagingKey: staging, contentType: "audio/mp4", store: big.store }), "TOO_LARGE");
  const wav = new Uint8Array(64);
  wav.set([0x52, 0x49, 0x46, 0x46]);
  const fake = fakeStore({ [staging]: { body: wav } });
  await reason(promoteAudio({ assetId: "sound-1", stagingKey: staging, contentType: "audio/mp4", store: fake.store }), "INVALID_MEDIA");
  assert.equal(fake.copies.length, 0);
  // The extension must match the declared type.
  await assert.rejects(
    promoteAudio({ assetId: "sound-1", stagingKey: staging, contentType: "audio/mpeg", store: fake.store }),
    /does not belong/,
  );
});
