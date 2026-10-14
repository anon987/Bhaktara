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
// dimensions) is kept while the key is unchanged. Media keys, provenance and
// the checklist are not shown in the editor any more, but they stay on the
// form so a save writes back what is stored.
export type DraftForm = {
  type: ContentType;
  title: { hi: string; en: string };
  description: { hi: string; en: string };
  // Song lyrics: Hindi (Devanagari) and Hinglish (Roman script).
  lyrics: { hi: string; en: string };
  audioLanguage: string;
  deityIds: string[];
  categoryIds: string[];
  tags: string[];
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
    lyrics: { hi: "", en: "" },
    audioLanguage: "",
    deityIds: [],
    categoryIds: [],
    tags: [],
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
    lyrics: { hi: draft.lyrics?.hi ?? "", en: draft.lyrics?.en ?? "" },
    audioLanguage: (draft.audioLanguage as string | undefined) ?? "",
    deityIds: [...draft.deityIds],
    categoryIds: [...draft.categoryIds],
    tags: [...draft.tags],
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
    lyrics: { ...form.lyrics },
    audioLanguage: form.audioLanguage.trim() || undefined,
    deityIds: form.deityIds,
    categoryIds: form.categoryIds,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
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

// Content types with spoken or sung audio (audio language applies).
export const audioTypes: readonly ContentType[] = ["BHAJAN", "AARTI", "MANTRA", "CHALISA", "RINGTONE"];

// a-z, 0-9 and "-", at most 60 characters ("" when nothing usable is left).
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

// New items get a readable, unique ID: the English title as a slug plus four
// random characters, e.g. "hanuman-wallpaper-k3x9".
export function generateContentId(form: Pick<DraftForm, "type" | "title">): string {
  const base = slugify(form.title.en) || form.type.toLowerCase();
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const random = crypto.getRandomValues(new Uint8Array(4));
  return `${base}-${Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

const mediaWord: Record<ContentType, string> = {
  BHAJAN: "the audio and cover image",
  AARTI: "the audio and cover image",
  MANTRA: "the audio and cover image",
  CHALISA: "the audio and cover image",
  WALLPAPER: "the wallpaper image",
  RINGTONE: "the ringtone audio",
  STATUS: "the status video",
};

// What still blocks READY, in plain words, for fields the editor shows:
// missing media becomes one "upload" line, and items recorded outside the
// editor (provenance, checklist) become one summary line.
export function editorReadiness(type: ContentType, problems: readonly Problem[]): Problem[] {
  const shown: Problem[] = [];
  let media = false;
  let review = 0;
  for (const problem of problems) {
    if (problem.field.startsWith("media")) media = true;
    else if (problem.field.startsWith("private.") || problem.field.startsWith("checklist.")) review += 1;
    else shown.push(problem);
  }
  if (media) shown.push({ field: "Media", message: `Upload ${mediaWord[type]}` });
  if (review)
    shown.push({
      field: "Review",
      message: `${review} review ${review === 1 ? "item" : "items"} (AI tool, source or checklist) not set in this editor`,
    });
  return shown;
}
