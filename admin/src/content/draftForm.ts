import {
  applicableChecks,
  CheckItem,
  ContentDraft,
  contentDraftSchema,
  ContentDraftInput,
  ContentType,
  defaultSaveGate,
  MediaVariant,
  MediaVariantName,
  mediaVariantNames,
  ReadinessProblem,
  readinessProblems,
} from "../domain";
import type { Problem } from "../errors";
import { isoToLocalInput, localInputToIso } from "../ui";

// Editor state: plain strings for the inputs, converted to the callable's
// ContentDraftInput on save. The original variant metadata (bytes, mime,
// dimensions) is kept while the key is unchanged.
export type DraftForm = {
  type: ContentType;
  title: { hi: string; en: string };
  description: { hi: string; en: string };
  audioLanguage: string;
  deityIds: string[];
  categoryIds: string;
  tags: string;
  media: Partial<Record<MediaVariantName, { key: string; original?: MediaVariant }>>;
  durationSeconds: string;
  isFeatured: boolean;
  saveGate: "REWARDED" | "FREE";
  isShareable: boolean;
  adEligible: boolean;
  expireAt: string;
  sourceText: string;
  sourceTextRef: string;
  aiTool: string;
  aiPlan: string;
  licenseRecordId: string;
  checklist: Partial<Record<CheckItem, boolean>>;
};

export function emptyForm(type: ContentType = "BHAJAN"): DraftForm {
  return {
    type,
    title: { hi: "", en: "" },
    description: { hi: "", en: "" },
    audioLanguage: "",
    deityIds: [],
    categoryIds: "",
    tags: "",
    media: {},
    durationSeconds: "",
    isFeatured: false,
    saveGate: defaultSaveGate(type),
    isShareable: true,
    adEligible: true,
    expireAt: "",
    sourceText: "",
    sourceTextRef: "",
    aiTool: "",
    aiPlan: "",
    licenseRecordId: "",
    checklist: {},
  };
}

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function formFromDraft(draft: ContentDraftInput): DraftForm {
  const media: DraftForm["media"] = {};
  for (const name of mediaVariantNames) {
    const variant = draft.media?.[name];
    if (variant) media[name] = { key: variant.key, original: variant };
  }
  return {
    type: draft.type,
    title: { ...draft.title },
    description: { ...draft.description },
    audioLanguage: (draft.audioLanguage as string | undefined) ?? "",
    deityIds: [...draft.deityIds],
    categoryIds: draft.categoryIds.join(", "),
    tags: draft.tags.join(", "),
    media,
    durationSeconds:
      draft.durationSeconds === undefined ? "" : String(draft.durationSeconds),
    isFeatured: draft.isFeatured,
    saveGate: draft.saveGate,
    isShareable: draft.isShareable,
    adEligible: draft.adEligible,
    expireAt: isoToLocalInput(draft.expireAt),
    sourceText: (draft.private.sourceText as string | undefined) ?? "",
    sourceTextRef: (draft.private.sourceTextRef as string | undefined) ?? "",
    aiTool: (draft.private.aiTool as string | undefined) ?? "",
    aiPlan: (draft.private.aiPlan as string | undefined) ?? "",
    licenseRecordId: (draft.private.licenseRecordId as string | undefined) ?? "",
    checklist: { ...draft.private.checklist },
  };
}

export function draftFromForm(form: DraftForm): ContentDraftInput {
  const media: ContentDraftInput["media"] = {};
  for (const name of mediaVariantNames) {
    const slot = form.media[name];
    const key = slot?.key.trim();
    if (!slot || !key) continue;
    media[name] = slot.original?.key === key ? slot.original : { key };
  }
  const applicable = new Set(applicableChecks(form.type));
  const duration = form.durationSeconds.trim();
  return {
    type: form.type,
    title: { ...form.title },
    description: { ...form.description },
    audioLanguage: form.audioLanguage.trim() || undefined,
    deityIds: form.deityIds,
    categoryIds: list(form.categoryIds),
    tags: list(form.tags),
    media,
    durationSeconds: duration === "" ? undefined : Number(duration),
    isFeatured: form.isFeatured,
    saveGate: form.saveGate,
    isShareable: form.isShareable,
    adEligible: form.adEligible,
    expireAt: localInputToIso(form.expireAt),
    private: {
      sourceText: form.sourceText,
      sourceTextRef: form.sourceTextRef,
      aiTool: form.aiTool,
      aiPlan: form.aiPlan,
      licenseRecordId: form.licenseRecordId,
      // Only the items that apply to the current type are sent.
      checklist: Object.fromEntries(
        Object.entries(form.checklist).filter(([item]) =>
          applicable.has(item as CheckItem),
        ),
      ),
    },
  };
}

export type DraftValidation = {
  draft: ContentDraft | null;
  // Shape errors: the server would reject the save outright.
  issues: Problem[];
  // Readiness: saving works, but DRAFT → READY will be refused.
  readiness: ReadinessProblem[];
};

// Instant feedback with the same schema and readiness rules as the server.
export function validateForm(form: DraftForm): DraftValidation {
  const parsed = contentDraftSchema.safeParse(draftFromForm(form));
  if (!parsed.success)
    return {
      draft: null,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      readiness: [],
    };
  return { draft: parsed.data, issues: [], readiness: readinessProblems(parsed.data) };
}
