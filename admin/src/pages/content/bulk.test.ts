import { describe, expect, it, vi } from "vitest";
import type { ContentRow } from "../../api";
import {
  actionApplies,
  actionVisible,
  applyListPatch,
  chunk,
  emptyDetailsForm,
  filterRows,
  patchFromForm,
  rowAfter,
  runBulk,
  summaryText,
  toggleSelection,
  ANY_DEITY,
  NO_DEITY,
  type BulkContentCall,
} from "./bulk";

const row = (id: string, extra: Partial<ContentRow> = {}): ContentRow => ({
  id,
  type: "BHAJAN",
  status: "DRAFT",
  title: { en: id, hi: "भजन" },
  updatedAt: null,
  scheduledAt: null,
  deityIds: ["shiva"],
  ...extra,
});

describe("bulk chunking", () => {
  it("splits into chunks of at most 200", () => {
    const ids = Array.from({ length: 450 }, (_, i) => `c${i}`);
    expect(chunk(ids).map((part) => part.length)).toEqual([200, 200, 50]);
  });

  it("sends more than 200 IDs as several calls and reports progress", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `c${i}`);
    const call = vi.fn<BulkContentCall>(async ({ ids: part }) => ({
      results: part.map((id) => ({ id, ok: true, status: "PUBLISHED" as const })),
    }));
    const progress = vi.fn();
    const results = await runBulk(call, ids, { kind: "transition", to: "PUBLISHED" }, progress);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0][0].ids).toHaveLength(200);
    expect(call.mock.calls[1][0].ids).toEqual(ids.slice(200));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(205, 205);
  });

  it("marks a whole chunk failed when its call fails and carries on", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `c${i}`);
    const call = vi
      .fn<BulkContentCall>()
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "functions/unavailable" }))
      .mockResolvedValueOnce({ results: [{ id: "c200", ok: true }] });
    const results = await runBulk(call, ids, { kind: "delete" });
    expect(results.filter((result) => !result.ok)).toHaveLength(200);
    expect(results.at(-1)).toEqual({ id: "c200", ok: true });
  });
});

describe("edit details patch", () => {
  it("sends only the fields that were changed", () => {
    expect(patchFromForm(emptyDetailsForm())).toEqual({});
    const form = emptyDetailsForm();
    form.deityIds = { mode: "replace", values: ["hanuman"] };
    form.tags = { mode: "remove", values: [] };
    form.isFeatured = "off";
    form.saveGate = "REWARDED";
    expect(patchFromForm(form)).toEqual({
      deityIds: { mode: "replace", values: ["hanuman"] },
      isFeatured: false,
      saveGate: "REWARDED",
    });
  });

  it("applies add, remove and replace to a list", () => {
    expect(applyListPatch(["a", "b"], { mode: "add", values: ["b", "c"] })).toEqual(["a", "b", "c"]);
    expect(applyListPatch(["a", "b"], { mode: "remove", values: ["a"] })).toEqual(["b"]);
    expect(applyListPatch(["a", "b"], { mode: "replace", values: ["z"] })).toEqual(["z"]);
  });

  it("updates rows in place after an action", () => {
    expect(rowAfter(row("a"), { kind: "transition", to: "PUBLISHED" }, { id: "a", ok: true })?.status).toBe("PUBLISHED");
    expect(
      rowAfter(row("a"), { kind: "update", patch: { deityIds: { mode: "add", values: ["hanuman"] } } }, { id: "a", ok: true })
        ?.deityIds,
    ).toEqual(["shiva", "hanuman"]);
    expect(rowAfter(row("a"), { kind: "delete" }, { id: "a", ok: true })).toBeNull();
  });
});

describe("selection", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("toggles one item, and shift-click selects the range from the last click", () => {
    let selected = toggleSelection(new Set(), order, "b", null, false);
    expect([...selected]).toEqual(["b"]);
    selected = toggleSelection(selected, order, "e", "b", true);
    expect([...selected].sort()).toEqual(["b", "c", "d", "e"]);
    // Shift-click on a selected item clears the range.
    selected = toggleSelection(selected, order, "c", "e", true);
    expect([...selected]).toEqual(["b"]);
  });
});

describe("actions per role", () => {
  it("shows editors only what they can do", () => {
    expect(actionVisible("ready", "EDITOR")).toBe(true);
    expect(actionVisible("draft", "EDITOR")).toBe(true);
    expect(actionVisible("edit", "EDITOR")).toBe(true);
    for (const id of ["publish", "schedule", "archive", "restore", "delete"] as const)
      expect(actionVisible(id, "EDITOR")).toBe(false);
    expect(actionApplies("draft", "READY", "EDITOR")).toBe(true);
    expect(actionApplies("draft", "PUBLISHED", "EDITOR")).toBe(false);
    expect(actionApplies("draft", "PUBLISHED", "CONTENT_ADMIN")).toBe(true);
  });

  it("publishes straight from draft and deletes only archived items or drafts", () => {
    expect(actionApplies("publish", "DRAFT", "CONTENT_ADMIN")).toBe(true);
    expect(actionApplies("publish", "PUBLISHED", "CONTENT_ADMIN")).toBe(false);
    expect(actionApplies("delete", "ARCHIVED", "SUPER_ADMIN")).toBe(true);
    expect(actionApplies("delete", "PUBLISHED", "SUPER_ADMIN")).toBe(false);
    expect(actionApplies("restore", "ARCHIVED", "CONTENT_ADMIN")).toBe(true);
  });
});

describe("filters and summary", () => {
  it("filters by deity and needs-attention", () => {
    const rows = [row("a"), row("b", { deityIds: [] }), row("c", { status: "PUBLISHED", deityIds: ["hanuman"] })];
    const ids = (deity: string, attention = false) =>
      filterRows(rows, { search: "", deity, attention }).map((item) => item.id);
    expect(ids(ANY_DEITY)).toEqual(["a", "b", "c"]);
    expect(ids("hanuman")).toEqual(["c"]);
    expect(ids(NO_DEITY)).toEqual(["b"]);
    expect(ids(ANY_DEITY, true)).toEqual(["b"]);
  });

  it("summarises a run", () => {
    expect(summaryText({ actionId: "publish", done: 38, skipped: 2, failed: [] })).toBe("38 published · 2 skipped");
  });
});
