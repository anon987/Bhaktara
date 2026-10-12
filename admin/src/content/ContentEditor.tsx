import { useCallback, useMemo, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentRecord } from "../api";
import { useLoad } from "../useLoad";
import { useAdmin } from "../app/context";
import { navigate, paths } from "../app/router";
import {
  can,
  ContentStatus,
  ContentType,
  contentTypes,
  defaultSaveGate,
  editableStatuses,
  readinessProblems,
} from "../domain";
import { readableError, ReadableError } from "../errors";
import {
  Checkbox,
  ErrorNotice,
  formatDate,
  issuesByField,
  ProblemList,
  TextField,
} from "../ui";
import {
  audioTypes,
  DraftForm,
  draftFromForm,
  editorReadiness,
  emptyForm,
  formFromDraft,
  generateContentId,
  validateForm,
} from "./draftForm";
import { MediaUpload } from "./MediaUpload";
import { TransitionPanel } from "./TransitionPanel";
import { ContentPreview } from "../components/panel/preview";
import { CreatableMultiSelect } from "../components/panel/CreatableMultiSelect";
import { useCategoryPicker, useDeityPicker, useTagPicker } from "./taxonomy";

type Props = { id?: string; type?: ContentType };

export function ContentEditor({ id, type }: Props) {
  if (!id) return <EditorForm record={null} initialType={type} onMoved={() => {}} />;
  return <ExistingContent id={id} />;
}

function ExistingContent({ id }: { id: string }) {
  const { api } = useAdmin();
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const load = useCallback(
    () => api.getContent(id),
    // version: bumped after a status move to reload the item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, id, version],
  );
  const { data: record, error: loadError, loading } = useLoad(load);

  // A reload after a status move keeps the editor on screen.
  if (record === undefined && loading) return <p role="status">Loading content…</p>;
  if (loadError)
    return (
      <section>
        <h1 tabIndex={-1}>Content</h1>
        <ErrorNotice error={loadError} />
      </section>
    );
  if (!record)
    return (
      <section>
        <h1 tabIndex={-1}>Not found</h1>
        <p>
          There is no content item “{id}”. <a href={paths.content}>Back to content</a>
        </p>
      </section>
    );
  return (
    <EditorForm
      key={`${record.id}:${record.status}:${record.updatedAt}`}
      record={record}
      flash={flash}
      onMoved={(from, to) => {
        setFlash(`Moved from ${from} to ${to}.`);
        setVersion((value) => value + 1);
      }}
      onMediaProcessed={() => {
        setFlash("Media rendered and saved.");
        setVersion((value) => value + 1);
      }}
    />
  );
}

type FormProps = {
  record: ContentRecord | null;
  flash?: string | null;
  onMoved: (from: ContentStatus, to: ContentStatus) => void;
  onMediaProcessed?: () => void;
  // The type a new item starts as (a library section's "New" button).
  initialType?: ContentType;
};

const typeNames: Record<ContentType, { one: string; many: string }> = {
  BHAJAN: { one: "Bhajan", many: "bhajans" },
  AARTI: { one: "Aarti", many: "aartis" },
  MANTRA: { one: "Mantra", many: "mantras" },
  CHALISA: { one: "Chalisa", many: "chalisas" },
  WALLPAPER: { one: "Wallpaper", many: "wallpapers" },
  RINGTONE: { one: "Ringtone", many: "ringtones" },
  STATUS: { one: "Status video", many: "status videos" },
};

const audioLanguages = [
  { value: "", label: "Not set" },
  { value: "hi", label: "Hindi" },
  { value: "sa", label: "Sanskrit" },
  { value: "bho", label: "Bhojpuri" },
  { value: "pa", label: "Punjabi" },
  { value: "en", label: "English" },
];

const formatDuration = (value: string) => {
  const seconds = Math.round(Number(value));
  if (!value || !Number.isFinite(seconds) || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

// The first error for a list field and its items (e.g. "tags.3").
const listError = (errors: Record<string, string>, field: string) =>
  Object.entries(errors).find(([key]) => key === field || key.startsWith(`${field}.`))?.[1];

export function EditorForm({ record, flash, onMoved, onMediaProcessed, initialType }: FormProps) {
  const { api, role } = useAdmin();
  const isNew = record === null;
  const initial = useMemo(
    () => (record ? formFromDraft(record.draft) : emptyForm(initialType)),
    [record, initialType],
  );
  const [form, setForm] = useState<DraftForm>(initial);
  const [saved, setSaved] = useState<DraftForm>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ReadableError | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const deities = useDeityPicker();
  const categories = useCategoryPicker();
  const tags = useTagPicker();

  const status: ContentStatus = record?.status ?? "DRAFT";
  const editable =
    can(role, "content.edit") && (isNew || editableStatuses.includes(status));
  const validation = useMemo(() => validateForm(form), [form]);
  const fieldErrors = issuesByField(validation.issues);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // Readiness of what is stored, which is what a status move checks.
  const savedReadiness = useMemo(() => {
    const result = validateForm(saved);
    return editorReadiness(
      saved.type,
      result.draft ? readinessProblems(result.draft) : result.issues,
    );
  }, [saved]);
  const newReadiness = editorReadiness(form.type, validation.readiness);

  const update = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setSavedMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const changeType = (type: ContentType) =>
    setForm((current) => ({
      ...current,
      type,
      // Keep the save policy in step with the type unless it was changed.
      saveGate:
        current.saveGate === defaultSaveGate(current.type)
          ? defaultSaveGate(type)
          : current.saveGate,
    }));

  const save = async () => {
    setSaveError(null);
    setSavedMessage(null);
    if (validation.issues.length) {
      summaryRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const draft = draftFromForm(form);
      if (isNew) {
        const result = await api.createContent(generateContentId(form), draft);
        navigate(paths.contentEdit(result.id));
        return;
      }
      await api.updateContent(record.id, draft);
      setSaved(form);
      setSavedMessage("Saved.");
    } catch (caught) {
      setSaveError(readableError(caught));
    } finally {
      setSaving(false);
    }
  };

  const isAudio = audioTypes.includes(form.type);
  const duration = formatDuration(form.durationSeconds);
  const showSummary = validation.issues.length > 0;
  const names = typeNames[form.type];
  const hasMedia = !!record && Object.keys(record.draft.media ?? {}).length > 0;
  const uploadBox = record && can(role, "content.upload") && editable && (
    <MediaUpload
      contentId={record.id}
      type={form.type}
      hasMedia={hasMedia}
      onProcessed={() => onMediaProcessed?.()}
    />
  );

  return (
    <div className="editor">
      <div className="page-header">
        <h1 tabIndex={-1}>
          {isNew ? `New ${names.one.toLowerCase()}` : record.draft.title.hi || record.draft.title.en || record.id}
        </h1>
        <a href={paths.content}>Back to content</a>
      </div>
      {!isNew && (
        <p className="muted">
          {names.one} · updated {formatDate(record.updatedAt)}
          {record.publishedAt && <> · first published {formatDate(record.publishedAt)}</>}
        </p>
      )}
      <p role="status" className="ok">
        {flash}
      </p>

      <div className="editor-grid">
        <form
          className="editor-main"
          aria-labelledby="draft-heading"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 id="draft-heading" className="visually-hidden">
            Draft fields
          </h2>
          {!editable && (
            <p className="notice">
              {can(role, "content.edit")
                ? `This item is ${status}. Move it back to DRAFT to edit it.`
                : "Your role can view content but not edit it."}
            </p>
          )}
          <div
            ref={summaryRef}
            tabIndex={-1}
            className={showSummary ? "notice notice-error" : undefined}
            role={showSummary ? "alert" : undefined}
          >
            {showSummary && (
              <>
                <p>
                  <strong>Fix these fields before saving.</strong>
                </p>
                <ProblemList problems={validation.issues} />
              </>
            )}
          </div>

          <fieldset disabled={!editable || saving}>
            <legend>Titles and description</legend>
            <div className="field">
              <label htmlFor="content-type">What is this?</label>
              <select
                id="content-type"
                value={form.type}
                onChange={(event) => changeType(event.target.value as ContentType)}
              >
                {contentTypes.map((type) => (
                  <option key={type} value={type}>
                    {typeNames[type].one}
                  </option>
                ))}
              </select>
            </div>
            <div className="two-col">
              <TextField
                label="Title in Hindi"
                lang="hi"
                value={form.title.hi}
                onChange={(hi) => update("title", { ...form.title, hi })}
                error={fieldErrors["title.hi"]}
              />
              <TextField
                label="Title in English"
                value={form.title.en}
                onChange={(en) => update("title", { ...form.title, en })}
                error={fieldErrors["title.en"]}
              />
              <TextField
                label="Description in Hindi"
                lang="hi"
                multiline
                value={form.description.hi}
                onChange={(hi) => update("description", { ...form.description, hi })}
                error={fieldErrors["description.hi"]}
              />
              <TextField
                label="Description in English"
                multiline
                value={form.description.en}
                onChange={(en) => update("description", { ...form.description, en })}
                error={fieldErrors["description.en"]}
              />
            </div>
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Deities, categories and tags</legend>
            {deities.error && <p className="field-error">Could not load deities: {deities.error}</p>}
            <CreatableMultiSelect
              label="Deities"
              noun="deity"
              options={deities.options}
              value={form.deityIds}
              onChange={(deityIds) => update("deityIds", deityIds)}
              onCreate={deities.create}
              askHindi
              max={10}
              disabled={!editable || saving}
              error={fieldErrors.deityIds}
              hint={
                deities.create
                  ? "Not in the list? Type the name and choose “Create”."
                  : "Ask an admin to add a deity that is missing."
              }
            />
            <CreatableMultiSelect
              label="Categories"
              noun="category"
              options={categories.options}
              value={form.categoryIds}
              onChange={(categoryIds) => update("categoryIds", categoryIds)}
              onCreate={categories.create}
              askHindi
              max={10}
              disabled={!editable || saving}
              error={listError(fieldErrors, "categoryIds")}
            />
            <CreatableMultiSelect
              label="Tags"
              noun="tag"
              options={tags.options}
              value={form.tags}
              onChange={(value) => update("tags", value)}
              onCreate={tags.create}
              max={40}
              disabled={!editable || saving}
              error={listError(fieldErrors, "tags")}
              hint="Words people might search for, in any language."
            />
            {isAudio && (
              <div className="field">
                <label htmlFor="audio-language">Language of the audio</label>
                <select
                  id="audio-language"
                  value={form.audioLanguage}
                  aria-invalid={fieldErrors.audioLanguage ? true : undefined}
                  onChange={(event) => update("audioLanguage", event.target.value)}
                >
                  {audioLanguages.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                  {!audioLanguages.some((language) => language.value === form.audioLanguage) && (
                    <option value={form.audioLanguage}>{form.audioLanguage}</option>
                  )}
                </select>
                {fieldErrors.audioLanguage && <p className="field-error">{fieldErrors.audioLanguage}</p>}
              </div>
            )}
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Options</legend>
            <div className="field">
              <label htmlFor="save-gate">Saving to the phone</label>
              <select
                id="save-gate"
                value={form.saveGate}
                onChange={(event) =>
                  update("saveGate", event.target.value as DraftForm["saveGate"])
                }
              >
                <option value="REWARDED">After a short ad</option>
                <option value="FREE">Free</option>
              </select>
            </div>
            <Checkbox
              label="Featured (shown first)"
              checked={form.isFeatured}
              onChange={(value) => update("isFeatured", value)}
            />
            <Checkbox
              label="People can share it"
              checked={form.isShareable}
              onChange={(value) => update("isShareable", value)}
            />
            <Checkbox
              label="Ads can be shown with it"
              checked={form.adEligible}
              onChange={(value) => update("adEligible", value)}
            />
            <TextField
              label="Remove from the app after (optional)"
              type="datetime-local"
              value={form.expireAt}
              onChange={(value) => update("expireAt", value)}
              hint="Your local time. Leave empty to keep it."
              error={fieldErrors.expireAt}
            />
            {form.type !== "WALLPAPER" && duration && (
              <p className="muted">Length: {duration} (set from the uploaded file)</p>
            )}
          </fieldset>

          {editable && (
            <div className="actions sticky-actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving ? "Saving…" : isNew ? "Create draft" : "Save draft"}
              </button>
              {dirty && !isNew && <span className="muted">Unsaved changes</span>}
            </div>
          )}
          <ErrorNotice error={saveError} />
          <p role="status" className="ok">
            {savedMessage}
          </p>
        </form>

        <aside className="editor-side" aria-label="Status and media">
          {isNew ? (
            <>
              <section className="panel">
                <h2>Status</h2>
                <p>New items start as a draft.</p>
                {newReadiness.length > 0 && (
                  <>
                    <p>
                      <strong>Needed before READY ({newReadiness.length})</strong>
                    </p>
                    <ProblemList problems={newReadiness} />
                  </>
                )}
              </section>
              {can(role, "content.upload") && (
                <section className="panel space-y-3" aria-labelledby="media-heading">
                  <h2 id="media-heading">Media</h2>
                  <p className="muted">
                    The upload box appears here after you press “Create draft”.
                  </p>
                  <p className="muted">
                    Have many {names.many}? Upload them all at once: a draft is made for each file, titled from the
                    file name.
                  </p>
                  <Button asChild className="w-full">
                    <a href={paths.upload(form.type)}>
                      <UploadCloud /> Upload files
                    </a>
                  </Button>
                </section>
              )}
            </>
          ) : (
            <>
              {/* No files yet: the upload box comes first. */}
              {!hasMedia && uploadBox}
              <ContentPreview
                type={record.draft.type}
                title={record.draft.title.en || record.draft.title.hi}
                media={record.draft.media}
                duration={record.draft.durationSeconds}
              />
              <TransitionPanel
                contentId={record.id}
                status={status}
                scheduledAt={record.scheduledAt}
                readiness={savedReadiness}
                dirty={dirty}
                onMoved={(to) => onMoved(status, to)}
              />
              {hasMedia && uploadBox}
              {can(role, "content.upload") && !editable && (
                <section className="panel" aria-labelledby="replace-heading">
                  <h2 id="replace-heading">Replace media</h2>
                  <p className="muted">
                    Media can be changed while the item is a Draft. Move it back to Draft above, replace the files,
                    then send it through READY again.
                  </p>
                </section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
