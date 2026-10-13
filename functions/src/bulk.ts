// Bulk content actions for the admin library (multi-select): status moves,
// metadata edits and permanent deletes. Each item runs in its own
// transaction with its own audit entry, so one failing item never blocks the
// others; the caller gets one result per ID, in the order sent.
import { DocumentData, FieldValue, Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  applyListPatch,
  BulkContentResult,
  bulkContentSchema,
  BulkItemResult,
  BulkPatch,
  ContentDraft,
  ContentStatus,
  contentDraftSchema,
  deletableContent,
  draftFromDocuments,
  gatedStatuses,
  ReadinessProblem,
} from "../../src/domain/cms";
import { contentSearchTokens } from "../../src/domain/search";
import { publishedContentSchema } from "../../src/repositories/firestoreSchemas";
import {
  Actor,
  db,
  parse,
  requirePermission,
  stripUndefined,
  writeAudit,
} from "./core";
import {
  assertKnownDeities,
  contentRef,
  loadDeities,
  planTransition,
  privateRef,
} from "./content";

const CONCURRENCY = 10;

// Runs `task` over `items` with at most `limit` in flight; results keep the
// input order.
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

const notFound = (id: string) =>
  new HttpsError("not-found", `Content "${id}" was not found.`);

const problemsError = (message: string, problems: ReadinessProblem[]) =>
  new HttpsError("failed-precondition", message, { problems });

// Stable JSON for change detection (Firestore does not preserve key order).
const stable = (value: unknown) => JSON.stringify(value ?? null);

// Converts a per-item failure into its result. Callable errors carry safe
// messages; anything else is logged and reported generically.
function failure(
  id: string,
  error: unknown,
  status: ContentStatus | undefined,
): BulkItemResult {
  if (error instanceof HttpsError) {
    const details = error.details as
      | {
          problems?: ReadinessProblem[];
          issues?: { path: string; message: string }[];
        }
      | undefined;
    const problems =
      details?.problems ??
      details?.issues?.map((issue) => ({
        field: issue.path,
        message: issue.message,
      }));
    return stripUndefined({
      id,
      ok: false,
      status,
      error: error.message,
      problems: problems?.length ? problems : undefined,
    });
  }
  logger.error("Bulk content item failed", {
    contentId: id,
    error: error instanceof Error ? error.message : String(error),
  });
  return stripUndefined({
    id,
    ok: false,
    status,
    error: "This item could not be changed. Please try again.",
  });
}

type ItemTask = (
  tx: Transaction,
  id: string,
  seen: (status: ContentStatus) => void,
) => Promise<BulkItemResult>;

async function runItem(id: string, task: ItemTask): Promise<BulkItemResult> {
  let status: ContentStatus | undefined;
  try {
    return await db().runTransaction((tx) =>
      task(tx, id, (current) => {
        status = current;
      }),
    );
  } catch (error) {
    return failure(id, error, status);
  }
}

async function readItem(tx: Transaction, id: string) {
  const [snapshot, privateSnapshot] = await tx.getAll(
    contentRef(id),
    privateRef(id),
  );
  if (!snapshot.exists) throw notFound(id);
  return {
    content: snapshot.data()!,
    privateRecord: privateSnapshot.exists ? privateSnapshot.data() : undefined,
  };
}

// ---- transition

function transitionTask(
  actor: Actor,
  to: ContentStatus,
  scheduledAt: string | undefined,
  now: Date,
): ItemTask {
  return async (tx, id, seen) => {
    const { content, privateRecord } = await readItem(tx, id);
    const from = content.status as ContentStatus;
    seen(from);
    // Already there: nothing to change (a SCHEDULED item is re-scheduled by
    // moving it back to READY first).
    if (from === to && to !== "SCHEDULED") return { id, ok: true, status: to };
    const request = { actor, id, content, privateRecord, to, scheduledAt, now };
    let updates: Record<string, unknown>;
    let via: ContentStatus | undefined;
    if (from === "DRAFT" && to === "PUBLISHED") {
      // "Publish now" from DRAFT: DRAFT → READY → PUBLISHED as one write,
      // with the same permission and readiness rules as the two moves.
      requirePermission(actor, "content.publish");
      const ready = await planTransition(tx, { ...request, to: "READY" });
      const published = await planTransition(tx, {
        ...request,
        content: { ...content, status: "READY" },
      });
      updates = { ...ready.updates, ...published.updates };
      via = "READY";
    } else {
      updates = (await planTransition(tx, request)).updates;
    }
    tx.update(contentRef(id), updates);
    writeAudit(tx, actor, {
      action: "content.bulk.transition",
      entity: "content",
      entityId: id,
      beforeSummary: { status: from },
      afterSummary: stripUndefined({
        status: to,
        via,
        scheduledAt: to === "SCHEDULED" ? scheduledAt : undefined,
      }),
    });
    return { id, ok: true, status: to };
  };
}

// ---- update (metadata only)

// The fields a bulk edit may change, validated with the editor's rules.
const patchedFieldsSchema = contentDraftSchema.pick({
  deityIds: true,
  categoryIds: true,
  tags: true,
  isFeatured: true,
  isShareable: true,
  adEligible: true,
  saveGate: true,
});
type PatchedFields = Pick<
  ContentDraft,
  | "deityIds"
  | "categoryIds"
  | "tags"
  | "isFeatured"
  | "isShareable"
  | "adEligible"
  | "saveGate"
>;

function updateTask(actor: Actor, patch: BulkPatch): ItemTask {
  return async (tx, id, seen) => {
    const { content } = await readItem(tx, id);
    const status = content.status as ContentStatus;
    seen(status);
    // Live (and about to go live) items change in the app without a
    // republish, so they need the publisher's permission.
    if (status === "PUBLISHED" || status === "SCHEDULED")
      requirePermission(actor, "content.publish");
    const before = draftFromDocuments(content, undefined);
    const current: PatchedFields = {
      deityIds: before.deityIds ?? [],
      categoryIds: before.categoryIds ?? [],
      tags: before.tags ?? [],
      isFeatured: before.isFeatured ?? false,
      isShareable: before.isShareable ?? true,
      adEligible: before.adEligible ?? true,
      saveGate: before.saveGate ?? "FREE",
    };
    const next = parse(patchedFieldsSchema, {
      deityIds: applyListPatch(current.deityIds, patch.deityIds),
      categoryIds: applyListPatch(current.categoryIds, patch.categoryIds),
      tags: applyListPatch(current.tags, patch.tags),
      isFeatured: patch.isFeatured ?? current.isFeatured,
      isShareable: patch.isShareable ?? current.isShareable,
      adEligible: patch.adEligible ?? current.adEligible,
      saveGate: patch.saveGate ?? current.saveGate,
    });
    const changedFields = (Object.keys(next) as (keyof PatchedFields)[])
      .filter((key) => stable(current[key]) !== stable(next[key]))
      .sort();
    if (!changedFields.length) return { id, ok: true, status };
    // READY, SCHEDULED and PUBLISHED items must stay ready.
    if (gatedStatuses.includes(status) && !next.deityIds.length)
      throw problemsError("Some required fields are missing.", [
        { field: "deityIds", message: "At least one deity is required" },
      ]);
    const deities = await loadDeities(tx, next.deityIds);
    if (patch.deityIds) assertKnownDeities(next, deities);

    const changes = Object.fromEntries(
      changedFields.map((key) => [key, next[key]]),
    );
    // Search tokens are always server-generated from the stored fields.
    const searchTokens = contentSearchTokens(
      {
        title: (content.title as { hi: string; en: string }) ?? {
          hi: "",
          en: "",
        },
        tags: next.tags,
        deityIds: next.deityIds,
        categoryIds: next.categoryIds,
      },
      deities,
    );
    if (status === "PUBLISHED") {
      // The live document must still satisfy the mobile app's read contract.
      const contract = publishedContentSchema.safeParse({
        ...content,
        ...changes,
        searchTokens,
        id,
        popularityScore: content.popularityScore ?? 0,
      });
      if (!contract.success)
        throw problemsError(
          "The change would break the published item.",
          contract.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        );
    }
    tx.update(contentRef(id), {
      ...changes,
      searchTokens,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, actor, {
      action: "content.bulk.update",
      entity: "content",
      entityId: id,
      beforeSummary: {
        status,
        ...pick(current, changedFields),
      },
      afterSummary: { status, ...changes, changedFields },
    });
    return { id, ok: true, status };
  };
}

const pick = (record: DocumentData, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, record[key]]));

// ---- delete

function deleteTask(actor: Actor): ItemTask {
  return async (tx, id, seen) => {
    const [snapshot, privateSnapshot] = await tx.getAll(
      contentRef(id),
      privateRef(id),
    );
    if (!snapshot.exists) throw notFound(id);
    const content = snapshot.data()!;
    const status = content.status as ContentStatus;
    seen(status);
    if (!deletableContent(content))
      throw new HttpsError(
        "failed-precondition",
        status === "DRAFT"
          ? "This draft was published before. Archive it before deleting."
          : `Content is ${status}. Only archived items or drafts that were never published can be deleted.`,
      );
    tx.delete(contentRef(id));
    if (privateSnapshot.exists) tx.delete(privateRef(id));
    // R2 media is left in place: there is no server-side delete for media
    // objects yet (assets are also kept until the 30-day cleanup).
    writeAudit(tx, actor, {
      action: "content.bulk.delete",
      entity: "content",
      entityId: id,
      beforeSummary: stripUndefined({
        status,
        type: content.type,
        title: content.title?.en,
        mediaKeys: Object.values(
          (content.media ?? {}) as Record<string, { key?: string }>,
        )
          .map((variant) => variant?.key)
          .filter(Boolean),
      }),
      afterSummary: null,
    });
    return { id, ok: true };
  };
}

// bulkContent callable. Every action needs content.edit; publishing moves,
// edits to live items and deletes also need content.publish.
export async function bulkContent(
  actor: Actor,
  data: unknown,
  now = new Date(),
): Promise<BulkContentResult> {
  requirePermission(actor, "content.edit");
  const { ids, action } = parse(bulkContentSchema, data);
  let task: ItemTask;
  switch (action.kind) {
    case "transition":
      task = transitionTask(actor, action.to, action.scheduledAt, now);
      break;
    case "update":
      task = updateTask(actor, action.patch);
      break;
    case "delete":
      requirePermission(actor, "content.publish");
      task = deleteTask(actor);
      break;
  }
  const results = await mapLimited(ids, CONCURRENCY, (id) => runItem(id, task));
  return { results };
}
