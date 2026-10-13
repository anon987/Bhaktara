import {
  DocumentData,
  FieldValue,
  Timestamp,
  Transaction,
} from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ContentDraft,
  contentDraftSchema,
  createContentSchema,
  ContentStatus,
  draftFromDocuments,
  editableStatuses,
  gatedStatuses,
  ReadinessProblem,
  readinessProblems,
  saveContentSchema,
  TransitionErrorDetails,
  transitions,
  transitionSchema,
} from "../../src/domain/cms";
import { checklistState } from "../../src/domain/checklist";
import { generateContentId } from "../../src/domain/contentId";
import { contentSearchTokens, SearchDeity } from "../../src/domain/search";
import { publishedContentSchema } from "../../src/repositories/firestoreSchemas";
import {
  Actor,
  db,
  parse,
  requirePermission,
  stripUndefined,
  writeAudit,
} from "./core";

export const contentRef = (id: string) => db().collection("content").doc(id);
export const privateRef = (id: string) =>
  db().collection("contentPrivate").doc(id);

export async function loadDeities(tx: Transaction, ids: string[]) {
  if (!ids.length) return new Map<string, SearchDeity>();
  const snapshots = await tx.getAll(
    ...ids.map((id) => db().collection("deities").doc(id)),
  );
  return new Map<string, SearchDeity>(
    snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => {
        const data = snapshot.data()!;
        return [snapshot.id, { name: data.name, aliases: data.aliases ?? [] }];
      }),
  );
}

export function assertKnownDeities(
  draft: Pick<ContentDraft, "deityIds">,
  deities: Map<string, SearchDeity>,
) {
  const unknown = draft.deityIds.filter((id) => !deities.has(id));
  if (unknown.length)
    throw new HttpsError("invalid-argument", "Some fields are invalid.", {
      issues: unknown.map((id) => ({
        path: "deityIds",
        message: `unknown deity ${id}`,
      })),
    });
}

// Doc 22 B1: tokens are generated here, on every server write, from the same
// builder the importer uses. Clients never write them.
function publicFields(
  id: string,
  draft: ContentDraft,
  deities: Map<string, SearchDeity>,
) {
  return stripUndefined({
    type: draft.type,
    title: draft.title,
    description: draft.description,
    slug: id,
    audioLanguage: draft.audioLanguage,
    deityIds: draft.deityIds,
    categoryIds: draft.categoryIds,
    tags: draft.tags,
    searchTokens: contentSearchTokens(draft, deities),
    media: draft.media,
    durationSeconds: draft.durationSeconds,
    isFeatured: draft.isFeatured,
    isPremium: false,
    saveGate: draft.saveGate,
    isShareable: draft.isShareable,
    adEligible: draft.adEligible,
    expireAt: draft.expireAt
      ? Timestamp.fromDate(new Date(draft.expireAt))
      : undefined,
  });
}

function privateFields(draft: ContentDraft) {
  return stripUndefined({
    sourceText: draft.private.sourceText,
    sourceTextRef: draft.private.sourceTextRef,
    aiTool: draft.private.aiTool,
    aiPlan: draft.private.aiPlan,
    licenseRecordId: draft.private.licenseRecordId,
    // Optional notes; only the items that apply to this type are stored.
    checklist: checklistState(draft.type, draft.private.checklist).values,
  });
}

const summary = (status: string, draft: ContentDraft) => ({
  status,
  type: draft.type,
  title: draft.title.en,
});

// Stable JSON for change detection (Firestore does not preserve key order).
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
        )
      : entry,
  );

// Crypto-backed float in [0, 1) for the generated ID suffix.
const secureRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;
const ID_ATTEMPTS = 8;

export async function createContent(actor: Actor, data: unknown) {
  requirePermission(actor, "content.edit");
  const { id: requestedId, draft } = parse(createContentSchema, data);
  return db().runTransaction(async (tx) => {
    // Explicit IDs (bulk uploader) must be free; generated ones retry on a
    // collision with a fresh random suffix.
    let id: string | undefined;
    for (let attempt = 0; attempt < ID_ATTEMPTS && !id; attempt++) {
      const candidate = requestedId ?? generateContentId(draft, secureRandom);
      const [existing, existingPrivate] = await tx.getAll(
        contentRef(candidate),
        privateRef(candidate),
      );
      if (!existing.exists && !existingPrivate.exists) id = candidate;
      else if (requestedId)
        throw new HttpsError(
          "already-exists",
          `Content "${requestedId}" already exists.`,
        );
    }
    if (!id)
      throw new HttpsError(
        "aborted",
        "Could not generate a free content ID. Please try again.",
      );
    const deities = await loadDeities(tx, draft.deityIds);
    assertKnownDeities(draft, deities);
    const now = FieldValue.serverTimestamp();
    tx.create(contentRef(id), {
      ...publicFields(id, draft, deities),
      status: "DRAFT",
      popularityScore: 0,
      updatedAt: now,
    });
    tx.create(privateRef(id), {
      ...privateFields(draft),
      createdBy: actor.uid,
      updatedBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });
    writeAudit(tx, actor, {
      action: "content.create",
      entity: "content",
      entityId: id,
      beforeSummary: null,
      afterSummary: summary("DRAFT", draft),
    });
    return { id, status: "DRAFT", problems: readinessProblems(draft) };
  });
}

// Fields are edited only in DRAFT (live items are moved back first), so an
// edit can never silently change what users see.
export async function updateContent(actor: Actor, data: unknown) {
  requirePermission(actor, "content.edit");
  const { id, draft } = parse(saveContentSchema, data);
  return db().runTransaction(async (tx) => {
    const [existing, existingPrivate] = await tx.getAll(
      contentRef(id),
      privateRef(id),
    );
    if (!existing.exists)
      throw new HttpsError("not-found", `Content "${id}" was not found.`);
    const content = existing.data()!;
    const stored = existingPrivate.data();
    if (!editableStatuses.includes(content.status))
      throw new HttpsError(
        "failed-precondition",
        `Content is ${content.status}. Move it back to DRAFT before editing.`,
      );
    const deities = await loadDeities(tx, draft.deityIds);
    assertKnownDeities(draft, deities);
    const previous = draftFromDocuments(content, stored);
    const changedFields = (Object.keys(draft) as (keyof ContentDraft)[])
      .filter((key) => stable(previous[key]) !== stable(draft[key]))
      .sort();
    const problems = readinessProblems(draft);
    if (!changedFields.length) return { id, status: content.status, problems };
    const now = FieldValue.serverTimestamp();
    // Replace the editable fields; keep server-owned ones.
    tx.set(
      contentRef(id),
      stripUndefined({
        ...publicFields(id, draft, deities),
        status: content.status,
        popularityScore: content.popularityScore ?? 0,
        publishedAt: content.publishedAt,
        updatedAt: now,
      }),
    );
    tx.set(
      privateRef(id),
      stripUndefined({
        ...privateFields(draft),
        importKey: stored?.importKey,
        generatedAt: stored?.generatedAt,
        createdBy: stored?.createdBy ?? actor.uid,
        createdAt: stored?.createdAt ?? now,
        updatedBy: actor.uid,
        updatedAt: now,
      }),
    );
    writeAudit(tx, actor, {
      action: "content.update",
      entity: "content",
      entityId: id,
      beforeSummary: { status: content.status, title: previous.title?.en },
      afterSummary: { ...summary(content.status, draft), changedFields },
    });
    return { id, status: content.status, problems };
  });
}

const incomplete = (problems: ReadinessProblem[]) =>
  new HttpsError("failed-precondition", "Some required fields are missing.", {
    // Legacy reason name kept for existing clients; means "not ready".
    reason: "CHECKLIST_INCOMPLETE",
    problems,
  } satisfies TransitionErrorDetails);

const millis = (value: unknown) =>
  value instanceof Timestamp ? value.toMillis() : undefined;

export type TransitionRequest = {
  actor: Actor;
  id: string;
  content: DocumentData;
  privateRecord: DocumentData | undefined;
  to: ContentStatus;
  scheduledAt?: string;
  now: Date;
};

// D-036 state machine with role rules (doc 08 §3) and required-field gating
// (readinessProblems; no checklist or provenance gates). Checks one move and
// returns the field updates without writing, so the bulk callable can chain
// DRAFT → READY → PUBLISHED into a single write.
export async function planTransition(
  tx: Transaction,
  input: TransitionRequest,
) {
  const { actor, id, content, to, now } = input;
  const from = content.status as ContentStatus;
  const permission = transitions[from]?.[to];
  if (!permission)
    throw new HttpsError(
      "failed-precondition",
      `Cannot move content from ${from} to ${to}.`,
      { reason: "INVALID_TRANSITION" } satisfies TransitionErrorDetails,
    );
  requirePermission(actor, permission);

  const updates: Record<string, unknown> = {
    status: to,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (gatedStatuses.includes(to)) {
    const parsed = contentDraftSchema.safeParse(
      draftFromDocuments(content, input.privateRecord),
    );
    if (!parsed.success)
      throw incomplete(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    const problems = readinessProblems(parsed.data);
    if (problems.length) throw incomplete(problems);
    // Regenerate on publish so deity renames and alias edits are picked up.
    updates.searchTokens = contentSearchTokens(
      parsed.data,
      await loadDeities(tx, parsed.data.deityIds),
    );
  }
  const expireAt = millis(content.expireAt);
  if (to === "SCHEDULED") {
    const at = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
    if (!(at > now.getTime()))
      throw new HttpsError(
        "failed-precondition",
        "Scheduling needs a publish time in the future.",
        { reason: "SCHEDULE_REQUIRED" } satisfies TransitionErrorDetails,
      );
    if (expireAt !== undefined && expireAt <= at)
      throw new HttpsError(
        "failed-precondition",
        "The expiry must be after the scheduled publish time.",
        { reason: "SCHEDULE_REQUIRED" } satisfies TransitionErrorDetails,
      );
    updates.scheduledAt = Timestamp.fromMillis(at);
  } else if (from === "SCHEDULED" && to !== "PUBLISHED") {
    updates.scheduledAt = FieldValue.delete();
  }
  if (to === "PUBLISHED") {
    if (expireAt !== undefined && expireAt <= now.getTime())
      throw new HttpsError(
        "failed-precondition",
        "The expiry date has already passed.",
      );
    // First publication time is kept across unpublish/republish.
    updates.publishedAt = content.publishedAt ?? Timestamp.fromDate(now);
    // The published document must satisfy the mobile app's read contract.
    const contract = publishedContentSchema.safeParse({
      ...content,
      searchTokens: updates.searchTokens,
      id,
      status: "PUBLISHED",
      popularityScore: content.popularityScore ?? 0,
    });
    if (!contract.success)
      throw incomplete(
        contract.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
  }
  return { from, updates };
}

// Shared by the callable and the scheduled publisher.
async function applyTransition(tx: Transaction, input: TransitionRequest) {
  const { actor, id, to } = input;
  const { from, updates } = await planTransition(tx, input);
  tx.update(contentRef(id), updates);
  writeAudit(tx, actor, {
    action: "content.transition",
    entity: "content",
    entityId: id,
    beforeSummary: { status: from },
    afterSummary: stripUndefined({
      status: to,
      scheduledAt: to === "SCHEDULED" ? input.scheduledAt : undefined,
    }),
  });
  return { id, from, to };
}

export async function transitionContentStatus(
  actor: Actor,
  data: unknown,
  now = new Date(),
) {
  const input = parse(transitionSchema, data);
  return db().runTransaction(async (tx) => {
    const [snapshot, privateSnapshot] = await tx.getAll(
      contentRef(input.contentId),
      privateRef(input.contentId),
    );
    if (!snapshot.exists)
      throw new HttpsError(
        "not-found",
        `Content "${input.contentId}" was not found.`,
      );
    return applyTransition(tx, {
      actor,
      id: input.contentId,
      content: snapshot.data()!,
      privateRecord: privateSnapshot.data(),
      to: input.to,
      scheduledAt: input.scheduledAt,
      now,
    });
  });
}

// Doc 08 §4 publishScheduledContent: SCHEDULED → PUBLISHED when due, and
// PUBLISHED → ARCHIVED after expireAt. Each item is its own transaction, so
// one failing item (e.g. a missing required field) never blocks the rest.
export async function publishDueContent(now = new Date()) {
  const actor: Actor = {
    uid: "system:publishScheduledContent",
    role: "SYSTEM",
  };
  const cutoff = Timestamp.fromDate(now);
  const collection = db().collection("content");
  const [due, expired] = await Promise.all([
    collection
      .where("status", "==", "SCHEDULED")
      .where("scheduledAt", "<=", cutoff)
      .limit(100)
      .get(),
    collection
      .where("status", "==", "PUBLISHED")
      .where("expireAt", "<=", cutoff)
      .limit(100)
      .get(),
  ]);
  const result = {
    published: [] as string[],
    archived: [] as string[],
    failed: [] as string[],
  };
  const jobs = [
    ...due.docs.map((doc) => ({
      id: doc.id,
      from: "SCHEDULED",
      field: "scheduledAt",
      to: "PUBLISHED" as const,
    })),
    ...expired.docs.map((doc) => ({
      id: doc.id,
      from: "PUBLISHED",
      field: "expireAt",
      to: "ARCHIVED" as const,
    })),
  ];
  for (const job of jobs) {
    try {
      const done = await db().runTransaction(async (tx) => {
        const [snapshot, privateSnapshot] = await tx.getAll(
          contentRef(job.id),
          privateRef(job.id),
        );
        const content = snapshot.data();
        // Re-check inside the transaction: the operator may have moved it.
        if (
          !content ||
          content.status !== job.from ||
          !((millis(content[job.field]) ?? Infinity) <= now.getTime())
        )
          return false;
        await applyTransition(tx, {
          actor,
          id: job.id,
          content,
          privateRecord: privateSnapshot.data(),
          to: job.to,
          now,
        });
        return true;
      });
      if (done)
        (job.to === "PUBLISHED" ? result.published : result.archived).push(
          job.id,
        );
    } catch (error) {
      result.failed.push(job.id);
      logger.error("Scheduled content transition failed", {
        contentId: job.id,
        to: job.to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
