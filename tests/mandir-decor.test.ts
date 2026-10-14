import { decorFor, decorFromDocument } from "../src/domain/mandirDecor";

const stored = {
  name: { en: "Golden temple", hi: "स्वर्ण मंदिर" },
  kind: "temple",
  art: { mobile: { key: "assets/temple-golden/mobile.webp" } },
  stage: { x: 0.33, y: 0.45, width: 0.34, height: 0.3 },
  deityIds: [],
  unlock: "REWARDED",
  sortOrder: 30,
  isActive: true,
  // Bookkeeping and Timestamps as stored by the admin save and the seed.
  createdAt: { seconds: 1, nanoseconds: 0 },
  updatedAt: { seconds: 2, nanoseconds: 0 },
  updatedBy: "uid-1",
  startAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
};

test("a stored offering with bookkeeping and Timestamps is read", () => {
  const item = decorFromDocument(
    "temple-golden",
    stored,
    new Date("2026-10-14"),
  );
  expect(item).toEqual(
    expect.objectContaining({
      id: "temple-golden",
      kind: "temple",
      imageKey: "assets/temple-golden/mobile.webp",
      unlock: "REWARDED",
      stage: { x: 0.33, y: 0.45, width: 0.34, height: 0.3 },
    }),
  );
});

test("inactive, imageless or not-yet-started offerings are skipped", () => {
  expect(decorFromDocument("a", { ...stored, isActive: false })).toBeNull();
  expect(decorFromDocument("b", { ...stored, art: undefined })).toBeNull();
  expect(
    decorFromDocument("c", stored, new Date("2025-12-31T00:00:00.000Z")),
  ).toBeNull();
});

test("decorFor keeps one kind, for every deity or the given one, in order", () => {
  const a = decorFromDocument("a", { ...stored, sortOrder: 20 })!;
  const b = decorFromDocument("b", {
    ...stored,
    sortOrder: 10,
    deityIds: ["shiva"],
  })!;
  expect(decorFor([a, b], "temple", "shiva").map((i) => i.id)).toEqual([
    "b",
    "a",
  ]);
  expect(decorFor([a, b], "temple", "durga").map((i) => i.id)).toEqual(["a"]);
  expect(decorFor([a, b], "light")).toEqual([]);
});
