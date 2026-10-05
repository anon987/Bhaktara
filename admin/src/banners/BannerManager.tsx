import { useCallback, useMemo, useState } from "react";
import type { BannerRecord } from "../api";
import { useAdmin } from "../app/context";
import { AssetPicker } from "../components/panel/media";
import { BannerInput, bannerInputSchema, bannerRoutes, can } from "../domain";
import { readableError, ReadableError } from "../errors";
import {
  Checkbox,
  ErrorNotice,
  formatDate,
  isoToLocalInput,
  issuesByField,
  localInputToIso,
  ProblemList,
  TextField,
} from "../ui";
import { useLoad } from "../useLoad";

// Doc 09 §7. Targets come from the internal route whitelist (D-015); there
// is no free-text URL. Writes go through create/update/deleteBanner.
type BannerForm = Omit<BannerInput, "startAt" | "endAt" | "priority" | "image"> & {
  startAt: string;
  endAt: string;
  priority: string;
  mobileKey: string;
  thumbKey: string;
  original?: BannerInput["image"];
};

const day = 24 * 60 * 60 * 1000;
function emptyBanner(): BannerForm {
  const now = Date.now();
  return {
    title: { hi: "", en: "" },
    subtitle: { hi: "", en: "" },
    ctaText: { hi: "", en: "" },
    target: { route: bannerRoutes[0] },
    priority: "0",
    startAt: isoToLocalInput(new Date(now).toISOString()),
    endAt: isoToLocalInput(new Date(now + 14 * day).toISOString()),
    isActive: false,
    languages: ["hi", "en"],
    mobileKey: "",
    thumbKey: "",
  };
}

function formFromBanner(banner: BannerInput): BannerForm {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    ctaText: banner.ctaText,
    target: banner.target,
    priority: String(banner.priority),
    startAt: isoToLocalInput(banner.startAt),
    endAt: isoToLocalInput(banner.endAt),
    isActive: banner.isActive,
    languages: banner.languages,
    mobileKey: banner.image.mobile.key,
    thumbKey: banner.image.thumb?.key ?? "",
    original: banner.image,
  };
}

// Keeps stored variant metadata while the key is unchanged.
const variant = (key: string, original?: { key: string }) =>
  original?.key === key.trim() ? original : { key: key.trim() };

export function bannerFromForm(form: BannerForm): unknown {
  const priority = form.priority.trim();
  return {
    title: form.title,
    subtitle: form.subtitle,
    ctaText: form.ctaText,
    image: {
      mobile: variant(form.mobileKey, form.original?.mobile),
      ...(form.thumbKey.trim()
        ? { thumb: variant(form.thumbKey, form.original?.thumb) }
        : {}),
    },
    target: form.target,
    priority: priority === "" ? NaN : Number(priority),
    startAt: localInputToIso(form.startAt) ?? "",
    endAt: localInputToIso(form.endAt) ?? "",
    isActive: form.isActive,
    languages: form.languages,
  };
}

export function BannerManager() {
  const { api, role } = useAdmin();
  const writable = can(role, "banner.write");
  const [version, setVersion] = useState(0);
  const [actionError, setActionError] = useState<ReadableError | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: BannerForm } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(
    // `now` is taken with the data, so "Live" reflects when it was loaded.
    async () => ({ banners: await api.listBanners(), now: Date.now() }),
    // version: bumped after each change to reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, version],
  );
  const { data, error: loadError, loading } = useLoad(load);
  const banners: BannerRecord[] = data?.banners ?? [];
  const now = data?.now ?? 0;
  const error = actionError ?? loadError;

  const remove = async (id: string) => {
    setActionError(null);
    setMessage(null);
    try {
      await api.deleteBanner(id);
      setConfirmDelete(null);
      setMessage("Banner deleted.");
      setVersion((value) => value + 1);
    } catch (caught) {
      setActionError(readableError(caught));
    }
  };

  return (
    <section aria-labelledby="banners-heading">
      <div className="page-header">
        <h1 id="banners-heading" tabIndex={-1}>
          Banners
        </h1>
        {writable && !editing && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setMessage(null);
              setEditing({ id: null, form: emptyBanner() });
            }}
          >
            New banner
          </button>
        )}
      </div>

      {editing && (
        <BannerEditor
          id={editing.id}
          initial={editing.form}
          onCancel={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
            setVersion((value) => value + 1);
          }}
        />
      )}

      <ErrorNotice error={error} />
      <p role="status" className="ok">
        {message}
      </p>

      <table className="table" aria-busy={loading}>
        <caption className="visually-hidden">Banners by priority</caption>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Target</th>
            <th scope="col">Priority</th>
            <th scope="col">Window</th>
            <th scope="col">State</th>
            {writable && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {banners.map(({ id, banner }) => {
            const live =
              banner.isActive &&
              Date.parse(banner.startAt) <= now &&
              Date.parse(banner.endAt) > now;
            return (
              <tr key={id}>
                <td>
                  {banner.title.en}
                  <span className="secondary" lang="hi">
                    {banner.title.hi}
                  </span>
                </td>
                <td>{banner.target.route}</td>
                <td>{banner.priority}</td>
                <td>
                  {formatDate(banner.startAt)} – {formatDate(banner.endAt)}
                </td>
                <td>
                  {live ? (
                    <span className="badge badge-published">Live</span>
                  ) : banner.isActive ? (
                    <span className="badge badge-scheduled">Active, outside window</span>
                  ) : (
                    <span className="badge badge-archived">Disabled</span>
                  )}{" "}
                  <span className="secondary">{banner.languages.join(", ")}</span>
                </td>
                {writable && (
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(null);
                          setEditing({ id, form: formFromBanner(banner) });
                        }}
                        aria-label={`Edit ${banner.title.en || id}`}
                      >
                        Edit
                      </button>
                      {confirmDelete === id ? (
                        <>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => remove(id)}
                          >
                            Confirm delete
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(id)}
                          aria-label={`Delete ${banner.title.en || id}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {!loading && !banners.length && !error && (
            <tr>
              <td colSpan={writable ? 6 : 5} className="muted">
                No banners yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function BannerEditor({
  id,
  initial,
  onCancel,
  onSaved,
}: {
  id: string | null;
  initial: BannerForm;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useAdmin();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReadableError | null>(null);
  const [attempted, setAttempted] = useState(false);

  const parsed = useMemo(() => bannerInputSchema.safeParse(bannerFromForm(form)), [form]);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
  const errors = attempted ? issuesByField(issues) : {};
  const set = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const localized = (key: "title" | "subtitle" | "ctaText", label: string) => (
    <div className="two-col">
      <TextField
        label={`${label} (Hindi)`}
        lang="hi"
        value={form[key].hi}
        onChange={(hi) => set(key, { ...form[key], hi })}
        error={errors[`${key}.hi`] ?? errors[key]}
      />
      <TextField
        label={`${label} (English)`}
        value={form[key].en}
        onChange={(en) => set(key, { ...form[key], en })}
        error={errors[`${key}.en`] ?? errors[key]}
      />
    </div>
  );

  const save = async () => {
    setAttempted(true);
    setError(null);
    if (!parsed.success) return;
    setSaving(true);
    try {
      if (id) await api.updateBanner(id, parsed.data);
      else await api.createBanner(parsed.data);
      onSaved(id ? "Banner updated." : "Banner created.");
    } catch (caught) {
      setError(readableError(caught));
      setSaving(false);
    }
  };

  return (
    <form
      className="panel"
      aria-labelledby="banner-form-heading"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 id="banner-form-heading">{id ? "Edit banner" : "New banner"}</h2>
      {attempted && issues.length > 0 && (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>Fix these fields before saving.</strong>
          </p>
          <ProblemList problems={issues} />
        </div>
      )}
      <fieldset disabled={saving}>
        <legend>Text</legend>
        {localized("title", "Title")}
        {localized("subtitle", "Subtitle")}
        {localized("ctaText", "Button text")}
      </fieldset>
      <fieldset disabled={saving}>
        <legend>Image and target</legend>
        <AssetPicker
          purpose="banner"
          label="Banner image"
          value={
            form.mobileKey
              ? {
                  mobile: form.original?.mobile ?? { key: form.mobileKey },
                  ...(form.thumbKey ? { thumb: form.original?.thumb ?? { key: form.thumbKey } } : {}),
                }
              : null
          }
          onChange={(art) =>
            setForm((current) => ({
              ...current,
              mobileKey: art?.mobile.key ?? "",
              thumbKey: art?.thumb?.key ?? "",
              original: art ? { mobile: art.mobile, ...(art.thumb ? { thumb: art.thumb } : {}) } : undefined,
            }))
          }
        />
        <div className="two-col">
          <TextField
            label="Mobile image key"
            value={form.mobileKey}
            onChange={(value) => set("mobileKey", value)}
            required
            error={errors["image.mobile.key"]}
            hint="Asset key, not a URL."
          />
          <TextField
            label="Thumbnail key"
            value={form.thumbKey}
            onChange={(value) => set("thumbKey", value)}
            error={errors["image.thumb.key"]}
          />
        </div>
        <div className="field">
          <label htmlFor="banner-route">Opens screen</label>
          <select
            id="banner-route"
            value={form.target.route}
            onChange={(event) =>
              set("target", { route: event.target.value as BannerInput["target"]["route"] })
            }
          >
            {bannerRoutes.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <fieldset disabled={saving}>
        <legend>Visibility</legend>
        <div className="two-col">
          <TextField
            label="Starts (your local time)"
            type="datetime-local"
            value={form.startAt}
            onChange={(value) => set("startAt", value)}
            error={errors.startAt}
          />
          <TextField
            label="Ends (your local time)"
            type="datetime-local"
            value={form.endAt}
            onChange={(value) => set("endAt", value)}
            error={errors.endAt}
          />
          <TextField
            label="Priority (0–1000, higher first)"
            type="number"
            value={form.priority}
            onChange={(value) => set("priority", value)}
            error={errors.priority}
          />
        </div>
        <div className="field" role="group" aria-labelledby="banner-languages">
          <span className="label" id="banner-languages">
            Languages
          </span>
          {(["hi", "en"] as const).map((language) => (
            <Checkbox
              key={language}
              label={language === "hi" ? "Hindi" : "English"}
              checked={form.languages.includes(language)}
              onChange={(checked) =>
                set(
                  "languages",
                  checked
                    ? [...form.languages, language]
                    : form.languages.filter((item) => item !== language),
                )
              }
            />
          ))}
          {errors.languages && <p className="field-error">{errors.languages}</p>}
        </div>
        <Checkbox
          label="Active"
          hint="Inactive banners are kept for reuse but never shown."
          checked={form.isActive}
          onChange={(value) => set("isActive", value)}
        />
      </fieldset>
      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : id ? "Save banner" : "Create banner"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      <ErrorNotice error={error} />
    </form>
  );
}
