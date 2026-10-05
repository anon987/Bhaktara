import { useCallback, useMemo, useRef, useState } from "react";
import type { ContentRecord, DeityOption } from "../api";
import { useLoad } from "../useLoad";
import { useAdmin } from "../app/context";
import { navigate, paths } from "../app/router";
import {
  applicableChecks,
  can,
  checkLabels,
  ContentStatus,
  ContentType,
  contentTypes,
  defaultSaveGate,
  editableStatuses,
  mediaVariantNames,
  readinessProblems,
  requiredVariants,
  sacredTypes,
  slugSchema,
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
  DraftForm,
  draftFromForm,
  emptyForm,
  formFromDraft,
  validateForm,
} from "./draftForm";
import { MediaUpload } from "./MediaUpload";
import { TransitionPanel } from "./TransitionPanel";

type Props = { id?: string };

export function ContentEditor({ id }: Props) {
  if (!id) return <EditorForm record={null} onMoved={() => {}} />;
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
};

export function EditorForm({ record, flash, onMoved, onMediaProcessed }: FormProps) {
  const { api, role } = useAdmin();
  const isNew = record === null;
  const initial = useMemo(
    () => (record ? formFromDraft(record.draft) : emptyForm()),
    [record],
  );
  const [form, setForm] = useState<DraftForm>(initial);
  const [saved, setSaved] = useState<DraftForm>(initial);
  const [newId, setNewId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ReadableError | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const loadDeities = useCallback(() => api.listDeities(), [api]);
  const { data: deityData, error: deityError } = useLoad(loadDeities);
  const deities: DeityOption[] = deityData ?? [];

  const status: ContentStatus = record?.status ?? "DRAFT";
  const editable =
    can(role, "content.edit") && (isNew || editableStatuses.includes(status));
  const validation = useMemo(() => validateForm(form), [form]);
  const fieldErrors = issuesByField(validation.issues);
  const idError =
    isNew && (attempted || newId !== "")
      ? slugSchema.safeParse(newId).success
        ? undefined
        : "Use a lowercase slug: a–z, 0–9, _ or -, starting with a letter or digit."
      : undefined;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // Readiness of what is stored, which is what a status move checks.
  const savedReadiness = useMemo(() => {
    const result = validateForm(saved);
    return result.draft ? readinessProblems(result.draft) : result.issues;
  }, [saved]);

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
    setAttempted(true);
    setSaveError(null);
    setSavedMessage(null);
    if (validation.issues.length || idError || (isNew && !newId)) {
      summaryRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const draft = draftFromForm(form);
      if (isNew) {
        const result = await api.createContent(newId, draft);
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

  const required = new Set(requiredVariants(form.type));
  const checks = applicableChecks(form.type);
  const knownDeities = new Set(deities.map((deity) => deity.id));
  const deityChoices = [
    ...deities,
    ...form.deityIds
      .filter((deityId) => !knownDeities.has(deityId))
      .map((deityId) => ({ id: deityId, name: { en: deityId, hi: "" } })),
  ];
  const showSummary = validation.issues.length > 0 || (attempted && !!idError);

  return (
    <div className="editor">
      <div className="page-header">
        <h1 tabIndex={-1}>{isNew ? "New content" : record.draft.title.en || record.id}</h1>
        <a href={paths.content}>Back to content</a>
      </div>
      {!isNew && (
        <p className="muted">
          <code>{record.id}</code> · updated {formatDate(record.updatedAt)}
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
                <ProblemList
                  problems={[
                    ...(idError ? [{ field: "id", message: idError }] : []),
                    ...validation.issues,
                  ]}
                />
              </>
            )}
          </div>

          <fieldset disabled={!editable || saving}>
            <legend>Basics</legend>
            {isNew && (
              <TextField
                label="ID (slug)"
                value={newId}
                onChange={(value) => setNewId(value.trim())}
                error={idError}
                required
                hint="Permanent. Lowercase letters, digits, _ or -, e.g. hanuman-chalisa-v1."
              />
            )}
            <div className="field">
              <label htmlFor="content-type">Type</label>
              <select
                id="content-type"
                value={form.type}
                onChange={(event) => changeType(event.target.value as ContentType)}
              >
                {contentTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="two-col">
              <TextField
                label="Title (Hindi)"
                lang="hi"
                value={form.title.hi}
                onChange={(hi) => update("title", { ...form.title, hi })}
                error={fieldErrors["title.hi"]}
              />
              <TextField
                label="Title (English)"
                value={form.title.en}
                onChange={(en) => update("title", { ...form.title, en })}
                error={fieldErrors["title.en"]}
              />
              <TextField
                label="Description (Hindi)"
                lang="hi"
                multiline
                value={form.description.hi}
                onChange={(hi) => update("description", { ...form.description, hi })}
                error={fieldErrors["description.hi"]}
              />
              <TextField
                label="Description (English)"
                multiline
                value={form.description.en}
                onChange={(en) => update("description", { ...form.description, en })}
                error={fieldErrors["description.en"]}
              />
            </div>
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Taxonomy</legend>
            <div className="field" role="group" aria-labelledby="deities-label">
              <span id="deities-label" className="label">
                Deities
              </span>
              <ErrorNotice error={deityError} />
              <div className="choices">
                {deityChoices.map((deity) => (
                  <Checkbox
                    key={deity.id}
                    label={
                      <>
                        {deity.name.en}{" "}
                        {deity.name.hi && <span lang="hi">({deity.name.hi})</span>}
                        {!knownDeities.has(deity.id) && deities.length > 0 && (
                          <span className="field-error"> unknown</span>
                        )}
                      </>
                    }
                    checked={form.deityIds.includes(deity.id)}
                    onChange={(checked) =>
                      update(
                        "deityIds",
                        checked
                          ? [...form.deityIds, deity.id]
                          : form.deityIds.filter((item) => item !== deity.id),
                      )
                    }
                  />
                ))}
                {!deityChoices.length && !deityError && (
                  <p className="muted">No active deities found.</p>
                )}
              </div>
              {fieldErrors.deityIds && <p className="field-error">{fieldErrors.deityIds}</p>}
            </div>
            <TextField
              label="Categories"
              value={form.categoryIds}
              onChange={(value) => update("categoryIds", value)}
              hint="Comma-separated category IDs."
              error={Object.entries(fieldErrors).find(([key]) => key.startsWith("categoryIds"))?.[1]}
            />
            <TextField
              label="Tags"
              value={form.tags}
              onChange={(value) => update("tags", value)}
              hint="Comma-separated, any language."
              error={Object.entries(fieldErrors).find(([key]) => key.startsWith("tags"))?.[1]}
            />
            <TextField
              label="Audio language"
              value={form.audioLanguage}
              onChange={(value) => update("audioLanguage", value)}
              hint="Language code such as hi or sa. Leave empty for images."
              error={fieldErrors.audioLanguage}
            />
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Media keys</legend>
            <p className="hint">
              Asset keys from the media pipeline, never URLs. Required for {form.type}:{" "}
              {[...required].join(", ")}.
            </p>
            <div className="two-col">
              {mediaVariantNames.map((name) => (
                <TextField
                  key={name}
                  label={`${name}${required.has(name) ? " (required)" : ""}`}
                  value={form.media[name]?.key ?? ""}
                  onChange={(key) =>
                    update("media", {
                      ...form.media,
                      [name]: { key, original: form.media[name]?.original },
                    })
                  }
                  placeholder={`${form.type.toLowerCase()}/id/${name}.hash.ext`}
                  error={fieldErrors[`media.${name}.key`] ?? fieldErrors[`media.${name}`]}
                />
              ))}
            </div>
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Flags and schedule</legend>
            <div className="field">
              <label htmlFor="save-gate">Save policy</label>
              <select
                id="save-gate"
                value={form.saveGate}
                onChange={(event) =>
                  update("saveGate", event.target.value as DraftForm["saveGate"])
                }
              >
                <option value="REWARDED">REWARDED (rewarded ad before saving)</option>
                <option value="FREE">FREE</option>
              </select>
            </div>
            <Checkbox
              label="Featured"
              checked={form.isFeatured}
              onChange={(value) => update("isFeatured", value)}
            />
            <Checkbox
              label="Shareable"
              checked={form.isShareable}
              onChange={(value) => update("isShareable", value)}
            />
            <Checkbox
              label="Ad-eligible"
              checked={form.adEligible}
              onChange={(value) => update("adEligible", value)}
            />
            <div className="two-col">
              <TextField
                label="Duration (seconds)"
                type="number"
                value={form.durationSeconds}
                onChange={(value) => update("durationSeconds", value)}
                error={fieldErrors.durationSeconds}
              />
              <TextField
                label="Expiry (your local time)"
                type="datetime-local"
                value={form.expireAt}
                onChange={(value) => update("expireAt", value)}
                hint="Optional. Published items are archived after this time."
                error={fieldErrors.expireAt}
              />
            </div>
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Provenance (private)</legend>
            <div className="two-col">
              <TextField
                label="AI tool"
                value={form.aiTool}
                onChange={(value) => update("aiTool", value)}
                error={fieldErrors["private.aiTool"]}
              />
              <TextField
                label="AI plan"
                value={form.aiPlan}
                onChange={(value) => update("aiPlan", value)}
                error={fieldErrors["private.aiPlan"]}
              />
              <TextField
                label="License record"
                value={form.licenseRecordId}
                onChange={(value) => update("licenseRecordId", value)}
                error={fieldErrors["private.licenseRecordId"]}
              />
              <TextField
                label="Source reference"
                value={form.sourceTextRef}
                onChange={(value) => update("sourceTextRef", value)}
                hint={sacredTypes.includes(form.type) ? "Required for this type." : undefined}
                error={fieldErrors["private.sourceTextRef"]}
              />
            </div>
            <TextField
              label="Source text (Devanagari)"
              lang="hi"
              multiline
              rows={6}
              value={form.sourceText}
              onChange={(value) => update("sourceText", value)}
              hint={sacredTypes.includes(form.type) ? "Required for this type." : undefined}
              error={fieldErrors["private.sourceText"]}
            />
          </fieldset>

          <fieldset disabled={!editable || saving}>
            <legend>Checklist (doc 12 §5)</legend>
            {checks.map((item) => (
              <Checkbox
                key={item}
                label={checkLabels[item]}
                checked={form.checklist[item] === true}
                onChange={(value) =>
                  update("checklist", { ...form.checklist, [item]: value })
                }
              />
            ))}
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
            <section className="panel">
              <h2>Status</h2>
              <p>New items start as DRAFT.</p>
              {validation.readiness.length > 0 && (
                <>
                  <p>
                    <strong>Needed before READY ({validation.readiness.length})</strong>
                  </p>
                  <ProblemList problems={validation.readiness} />
                </>
              )}
            </section>
          ) : (
            <>
              <TransitionPanel
                contentId={record.id}
                status={status}
                scheduledAt={record.scheduledAt}
                readiness={savedReadiness}
                dirty={dirty}
                onMoved={(to) => onMoved(status, to)}
              />
              {can(role, "content.upload") && editable && (
                <MediaUpload contentId={record.id} type={form.type} onProcessed={() => onMediaProcessed?.()} />
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
