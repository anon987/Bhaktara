import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { AdminApi, ContentRow } from "../../api";
import { withoutUndefined } from "../../callable";
import { readConfig } from "../../config";
import {
  can,
  nameOnlyTypes,
  requiredVariants,
  transitions,
  type AdminRole,
  type ContentStatus,
  type Permission,
} from "../../domain";
import { fieldLabel, readableError } from "../../errors";

// Bulk select and manage for the content library. The server callable
// (bulkContent, branch feat/bulk-content-api) checks role, status and
// readiness per item again; the rules here only decide which buttons to
// show, how many items each applies to and which IDs to send.

// ---- The bulkContent contract.
export type ListMode = "add" | "remove" | "replace";
export type ListPatch = { mode: ListMode; values: string[] };
export type BulkPatch = {
  deityIds?: ListPatch;
  categoryIds?: ListPatch;
  tags?: ListPatch;
  isFeatured?: boolean;
  isShareable?: boolean;
  adEligible?: boolean;
  saveGate?: "FREE" | "REWARDED";
};
export type BulkTarget = ContentStatus;
export type BulkAction =
  | { kind: "transition"; to: BulkTarget; scheduledAt?: string }
  | { kind: "update"; patch: BulkPatch }
  | { kind: "delete" };
export type BulkProblem = { field: string; message: string };
export type BulkItemResult = {
  id: string;
  ok: boolean;
  status?: ContentStatus;
  problems?: BulkProblem[];
  error?: string;
};
export type BulkContentInput = { ids: string[]; action: BulkAction };
export type BulkContentOutput = { results: BulkItemResult[] };
export type BulkContentCall = (input: BulkContentInput) => Promise<BulkContentOutput>;

// The server takes at most this many IDs per call.
export const BULK_CHUNK = 200;

// api.bulkContent once feat/bulk-content-api is merged; until then a direct
// call to the same callable so this branch works on its own.
export function bulkClient(api: AdminApi): BulkContentCall {
  const own = (api as AdminApi & { bulkContent?: BulkContentCall }).bulkContent;
  if (typeof own === "function") return (input) => own.call(api, input);
  return async (input) => {
    const functions = getFunctions(getApp(), readConfig(import.meta.env).functionsRegion);
    const call = httpsCallable<BulkContentInput, BulkContentOutput>(functions, "bulkContent", {
      timeout: 300_000,
    });
    return (await call(withoutUndefined(input))).data;
  };
}

export function chunk<T>(items: readonly T[], size = BULK_CHUNK): T[][] {
  const parts: T[][] = [];
  for (let start = 0; start < items.length; start += size) parts.push(items.slice(start, start + size));
  return parts;
}

// Runs one action over any number of IDs, BULK_CHUNK at a time, in order.
// A chunk that fails as a whole (network, permission) marks its items failed
// and the run carries on with the next chunk.
export async function runBulk(
  call: BulkContentCall,
  ids: readonly string[],
  action: BulkAction,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkItemResult[]> {
  const results: BulkItemResult[] = [];
  onProgress?.(0, ids.length);
  for (const part of chunk(ids)) {
    try {
      const { results: answered } = await call({ ids: part, action });
      const byId = new Map(answered.map((result) => [result.id, result]));
      for (const id of part)
        results.push(byId.get(id) ?? { id, ok: false, error: "The server did not answer for this item." });
    } catch (caught) {
      const error = readableError(caught);
      for (const id of part)
        results.push({ id, ok: false, error: `${error.title}: ${error.message}`, problems: error.problems });
    }
    onProgress?.(results.length, ids.length);
  }
  return results;
}

// ---- Actions in the bar.
export type BulkActionId =
  | "ready"
  | "publish"
  | "schedule"
  | "draft"
  | "archive"
  | "restore"
  | "edit"
  | "delete";

type ActionDef = {
  id: BulkActionId;
  label: string;
  // "38 published"
  done: string;
  to?: ContentStatus;
  from?: readonly ContentStatus[];
};

// PUBLISHED straight from DRAFT is a bulk-only shortcut (the server checks
// readiness first), so it is not in the single-item transitions table.
const transitionPermission = (from: ContentStatus, to: ContentStatus): Permission | undefined =>
  transitions[from][to] ?? (from === "DRAFT" && to === "PUBLISHED" ? "content.publish" : undefined);

export const bulkActions: readonly ActionDef[] = [
  { id: "ready", label: "Mark ready", done: "marked ready", to: "READY", from: ["DRAFT"] },
  { id: "publish", label: "Publish now", done: "published", to: "PUBLISHED", from: ["DRAFT", "READY", "SCHEDULED"] },
  { id: "schedule", label: "Schedule…", done: "scheduled", to: "SCHEDULED", from: ["READY"] },
  { id: "draft", label: "Back to draft", done: "moved back to draft", to: "DRAFT", from: ["READY", "PUBLISHED"] },
  { id: "archive", label: "Archive", done: "archived", to: "ARCHIVED", from: ["DRAFT", "PUBLISHED"] },
  { id: "restore", label: "Restore", done: "restored to draft", to: "DRAFT", from: ["ARCHIVED"] },
  { id: "edit", label: "Edit details…", done: "updated" },
  // Only ARCHIVED items or drafts that were never published; the row does
  // not say whether a draft was published before, so the server decides.
  { id: "delete", label: "Delete…", done: "deleted", from: ["ARCHIVED", "DRAFT"] },
];
export const bulkAction = (id: BulkActionId) => bulkActions.find((action) => action.id === id)!;

const permissionFor = (action: ActionDef, from: ContentStatus): Permission | undefined => {
  if (action.id === "edit") return "content.edit";
  if (action.id === "delete") return action.from!.includes(from) ? "content.publish" : undefined;
  if (!action.from!.includes(from)) return undefined;
  return transitionPermission(from, action.to!);
};

// Can this role ever use the action? Hidden from the bar when not.
export function actionVisible(id: BulkActionId, role: AdminRole | null | undefined): boolean {
  const action = bulkAction(id);
  if (action.id === "edit") return can(role, "content.edit");
  return action.from!.some((from) => {
    const permission = permissionFor(action, from);
    return !!permission && can(role, permission);
  });
}

export function actionApplies(id: BulkActionId, status: ContentStatus, role: AdminRole | null | undefined): boolean {
  const permission = permissionFor(bulkAction(id), status);
  return !!permission && can(role, permission);
}

export const actionFor = (
  id: BulkActionId,
  extra: { scheduledAt?: string; patch?: BulkPatch } = {},
): BulkAction => {
  if (id === "edit") return { kind: "update", patch: extra.patch ?? {} };
  if (id === "delete") return { kind: "delete" };
  const to = bulkAction(id).to!;
  return to === "SCHEDULED" ? { kind: "transition", to, scheduledAt: extra.scheduledAt } : { kind: "transition", to };
};

// ---- Edit details: form state → the patch with only the changed fields.
export type Tri = "leave" | "on" | "off";
export type ListEdit = { mode: ListMode; values: string[] };
export type DetailsForm = {
  deityIds: ListEdit;
  categoryIds: ListEdit;
  tags: ListEdit;
  isFeatured: Tri;
  isShareable: Tri;
  adEligible: Tri;
  saveGate: "leave" | "FREE" | "REWARDED";
};
export const emptyDetailsForm = (): DetailsForm => ({
  deityIds: { mode: "add", values: [] },
  categoryIds: { mode: "add", values: [] },
  tags: { mode: "add", values: [] },
  isFeatured: "leave",
  isShareable: "leave",
  adEligible: "leave",
  saveGate: "leave",
});

export function patchFromForm(form: DetailsForm): BulkPatch {
  const patch: BulkPatch = {};
  for (const field of ["deityIds", "categoryIds", "tags"] as const)
    if (form[field].values.length) patch[field] = { mode: form[field].mode, values: [...form[field].values] };
  for (const field of ["isFeatured", "isShareable", "adEligible"] as const)
    if (form[field] !== "leave") patch[field] = form[field] === "on";
  if (form.saveGate !== "leave") patch.saveGate = form.saveGate;
  return patch;
}

export function applyListPatch(current: readonly string[], patch: ListPatch): string[] {
  if (patch.mode === "replace") return [...patch.values];
  if (patch.mode === "remove") return current.filter((value) => !patch.values.includes(value));
  return [...current, ...patch.values.filter((value) => !current.includes(value))];
}

// The row after a successful action (null: deleted), so the list updates in
// place without a reload.
export function rowAfter(row: ContentRow, action: BulkAction, result: BulkItemResult): ContentRow | null {
  const updatedAt = new Date().toISOString();
  if (action.kind === "delete") return null;
  if (action.kind === "transition") {
    const status = result.status ?? action.to;
    return { ...row, status, updatedAt, scheduledAt: status === "SCHEDULED" ? (action.scheduledAt ?? row.scheduledAt) : null };
  }
  return {
    ...row,
    status: result.status ?? row.status,
    updatedAt,
    deityIds: action.patch.deityIds ? applyListPatch(row.deityIds ?? [], action.patch.deityIds) : row.deityIds,
  };
}

// ---- Selection: click toggles; shift-click sets the range from the last
// clicked item to this one to this one's new state.
export function toggleSelection(
  selected: ReadonlySet<string>,
  order: readonly string[],
  id: string,
  anchor: string | null,
  shift: boolean,
): Set<string> {
  const next = new Set(selected);
  const on = !selected.has(id);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (shift && from >= 0 && to >= 0) {
    for (const item of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
      if (on) next.add(item);
      else next.delete(item);
    }
  } else if (on) next.add(id);
  else next.delete(id);
  return next;
}

// ---- Library filters.
export type SortKey = "updated" | "title";
export type RowFilter = { search: string; deity: string; attention: boolean };
export const NO_DEITY = "__none__";
export const ANY_DEITY = "__any__";
export const titleOf = (row: ContentRow) => row.title.en || row.title.hi || row.id;

// What the row alone shows is missing before READY (the description is not
// on the row, so this is a subset of readinessProblems).
export function rowProblems(row: ContentRow): string[] {
  const problems: string[] = [];
  if (!(row.deityIds ?? []).length) problems.push("No deity");
  if (row.status !== "DRAFT") return problems;
  if (nameOnlyTypes.includes(row.type)) {
    if (!row.title.en && !row.title.hi) problems.push("No name");
  } else {
    if (!row.title.hi) problems.push("No Hindi title");
    if (!row.title.en) problems.push("No English title");
  }
  if (row.media && row.type && requiredVariants(row.type).some((variant) => !row.media?.[variant]))
    problems.push("Missing media");
  return problems;
}

export function filterRows(rows: readonly ContentRow[], filter: RowFilter): ContentRow[] {
  const q = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !`${row.title.en} ${row.title.hi} ${row.id} ${(row.deityIds ?? []).join(" ")}`.toLowerCase().includes(q))
      return false;
    if (filter.deity === NO_DEITY && (row.deityIds ?? []).length) return false;
    if (filter.deity !== NO_DEITY && filter.deity !== ANY_DEITY && !(row.deityIds ?? []).includes(filter.deity))
      return false;
    if (filter.attention && !rowProblems(row).length) return false;
    return true;
  });
}

export function sortRows(rows: readonly ContentRow[], sort: SortKey): ContentRow[] {
  const sorted = [...rows];
  if (sort === "title") sorted.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  else sorted.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return sorted;
}

// ---- Results.
export type BulkRun = {
  actionId: BulkActionId;
  done: number;
  // Selected but the action does not apply to them (not sent).
  skipped: number;
  failed: { id: string; title: string; reason: string }[];
};

export const failureReason = (result: BulkItemResult): string =>
  result.problems?.length
    ? result.problems.map((problem) => `${fieldLabel(problem.field)}: ${problem.message}`).join("; ")
    : result.error || "The server refused this item.";

export function summaryText(run: BulkRun): string {
  const parts = [`${run.done} ${bulkAction(run.actionId).done}`];
  if (run.skipped) parts.push(`${run.skipped} skipped`);
  if (run.failed.length) parts.push(`${run.failed.length} failed`);
  return parts.join(" · ");
}
