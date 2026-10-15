import { MAX_LOCALIZE_TITLES, type AdminApi, type LocalizedText } from "../../api";
import { lyricsSide, placeLocalized, sourceSide, type Side } from "../../content/localize";
import { draftFromForm, emptyForm } from "../../content/draftForm";
import { songTypes, LYRICS_MAX_LENGTH, uploadKinds, type ContentType, type Lyrics, type UploadMime } from "../../domain";
import { isM4a, readM4aMetadata, type M4aMetadata } from "../../lib/m4aMetadata";
import type { MediaInputRole } from "../../../../src/domain/mediaProcessing";
import { readableError } from "../../errors";
import type { PanelApi } from "../../panelApi";
import { deitiesFromPath, roleOf, rolesFor, slugFromFileName, titleFromFileName, type PlannedItem } from "../../components/panel/files";
import type { MediaSet } from "../../components/panel/preview";

// The bulk uploader's steps for one item (D-036 drafts + doc 22 §A4 media):
// create the DRAFT → upload each original to R2 staging → processMedia renders
// the variants onto the item. A failed item resumes from where it stopped.

export type Stage = "waiting" | "creating" | "uploading" | "rendering" | "done" | "error";
export type UploadRow = PlannedItem & {
  id: string;
  title: { hi: string; en: string };
  stage: Stage;
  progress: number;
  error?: string;
  // Set once the draft exists (the ID may have gained a -2 suffix).
  contentId?: string;
  media?: MediaSet;
  durationSeconds?: number | null;
  warnings: string[];
  // Moved to READY after rendering (BatchDefaults.markReady).
  ready?: boolean;
  // Titles changed outside the row's own inputs (Gemini) after its draft
  // was created; the row offers Save until they are stored.
  titleUnsaved?: boolean;
  // Sides the editor typed into; Gemini never overwrites them.
  typed?: Partial<Record<Side, boolean>>;
  // Song lyrics (Hindi and Hinglish), from the m4a tags, Gemini or typed.
  lyrics: Lyrics;
  // Lyrics sides the editor typed into; Gemini never overwrites them.
  lyricsTyped?: Partial<Record<Side, boolean>>;
  lyricsStatus?: LyricsStatus;
  // Lyrics changed after the draft was created; the row offers Save.
  lyricsUnsaved?: boolean;
  // The m4a tags were read (once per row, before Gemini fills anything).
  tagsRead?: boolean;
  // `extra` is the album art from the m4a, not an image the operator added.
  coverFromFile?: boolean;
};
export type LyricsStatus = "reading" | "writing" | "done" | "failed";
export type BatchDefaults = {
  deityIds: string[];
  audioLanguage: string;
  aiTool: string;
  aiPlan: string;
  // Move each item to READY once its media is rendered, when nothing blocks it.
  markReady: boolean;
};

// A title in Devanagari only is Hindi; anything else starts on the English
// side. Gemini then fills the other side (and moves a title it reads as the
// other language).
export const titleSide = (title: string): Side => (/[ऀ-ॿ]/.test(title) && !/[A-Za-z]/.test(title) ? "hi" : "en");
const titleOnSide = (title: string): UploadRow["title"] =>
  titleSide(title) === "hi" ? { hi: title, en: "" } : { hi: "", en: title };
export const titleFromName = (name: string): UploadRow["title"] => titleOnSide(titleFromFileName(name));

// Types that carry song lyrics: the devotional audio types (cms.ts).
export const hasLyrics = (type: ContentType) => songTypes.includes(type);

export const rowFromPlan = (item: PlannedItem): UploadRow => ({
  ...item,
  id: slugFromFileName(item.name),
  title: titleFromName(item.name),
  lyrics: { hi: "", en: "" },
  stage: "waiting",
  progress: 0,
  warnings: [],
});

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

// A re-planned item (more files were added) keeps what its waiting row
// already has: titles, lyrics, the tags read and album art. An image the
// operator attaches replaces the album art.
export function replanRow(item: PlannedItem, previous: UploadRow | undefined): UploadRow {
  const row = rowFromPlan(item);
  if (!previous || previous.stage !== "waiting" || !sameFile(previous.main, item.main)) return row;
  const keepCover = !item.extra && previous.coverFromFile && previous.extra;
  return {
    ...row,
    title: previous.title,
    typed: previous.typed,
    lyrics: previous.lyrics,
    lyricsTyped: previous.lyricsTyped,
    lyricsStatus: previous.lyricsStatus,
    tagsRead: previous.tagsRead,
    ...(keepCover ? { extra: previous.extra, coverFromFile: true } : {}),
  };
}

// ---- m4a tags --------------------------------------------------------------

// The album art as the row's cover image, named after the row, or null when
// it is larger than an image upload may be.
export function coverFile(row: Pick<UploadRow, "id">, cover: NonNullable<M4aMetadata["cover"]>): File | null {
  const kind = uploadKinds[cover.mime];
  if (!cover.bytes.length || cover.bytes.length > kind.maxBytes) return null;
  return new File([cover.bytes as BlobPart], `${row.id}-cover.${kind.ext}`, { type: cover.mime });
}

// The row with its m4a tags applied:
// - the title tag replaces the file-name title, on its script's side, unless
//   the editor typed a title or it was changed (e.g. by Gemini) already;
// - lyrics go to their script's side when that side is empty and untyped;
// - album art becomes the cover when the operator attached no image.
// A row whose file changed meanwhile is returned as it is.
export function withTags(row: UploadRow, file: File, tags: M4aMetadata, type: ContentType): UploadRow {
  if (row.main !== file && !sameFile(row.main, file)) return row;
  const next: UploadRow = { ...row, tagsRead: true };
  const fromName = titleFromName(row.name);
  const title = tags.title?.trim().slice(0, 200);
  if (title && !row.typed?.hi && !row.typed?.en && row.title.hi === fromName.hi && row.title.en === fromName.en)
    next.title = titleOnSide(title);
  const lyrics = tags.lyrics?.trim().slice(0, LYRICS_MAX_LENGTH);
  if (lyrics && hasLyrics(type)) {
    const side = lyricsSide(lyrics);
    if (!row.lyrics[side].trim() && !row.lyricsTyped?.[side]) next.lyrics = { ...row.lyrics, [side]: lyrics };
  }
  if (tags.cover && !row.extra && rolesFor(type).extra === "image") {
    const cover = coverFile(row, tags.cover);
    if (cover) {
      next.extra = cover;
      next.coverFromFile = true;
    }
  }
  return next;
}

// Rows whose m4a tags are still to be read.
export const needsTags = (row: UploadRow) => !row.tagsRead && row.stage === "waiting" && isM4a(row.main);

// Runs `task` for each item, at most `limit` at a time.
export async function eachLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

// Reads the tags of every row that needs it (4 files at a time) and hands
// each result to `apply` as it arrives. A failed read counts as no tags.
export async function readRowTags(
  rows: UploadRow[],
  apply: (key: string, file: File, tags: M4aMetadata) => void,
  read: (file: Blob) => Promise<M4aMetadata> = readM4aMetadata,
): Promise<void> {
  await eachLimit(rows.filter(needsTags), 4, async (row) => {
    let tags: M4aMetadata = {};
    try {
      tags = await read(row.main);
    } catch {
      // Nothing found; the row keeps its file-name title.
    }
    apply(row.key, row.main, tags);
  });
}

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? "";

// Asks both callables about an item that cannot exist: "not found" means
// uploads and rendering are configured; "failed-precondition" means they are
// not, and nothing is created.
const PREFLIGHT_ID = "zz-upload-check";
export async function uploadsUnavailable(api: AdminApi, panel: PanelApi): Promise<string | null> {
  const probes: [string, () => Promise<unknown>][] = [
    ["Uploads", () => api.requestUploadUrl({ contentId: PREFLIGHT_ID, contentType: "image/webp", bytes: 1 })],
    [
      "Media rendering",
      () =>
        panel.processMedia({
          contentId: PREFLIGHT_ID,
          inputs: { image: `staging/${PREFLIGHT_ID}/00000000-0000-4000-8000-000000000000.webp` },
        }),
    ],
  ];
  for (const [what, probe] of probes) {
    try {
      await probe();
    } catch (error) {
      const code = codeOf(error);
      if (code.endsWith("not-found")) continue;
      if (code.endsWith("failed-precondition"))
        return `${what} are not set up on this server yet, so nothing was uploaded. Media uploads need the R2 keys and the media processor (see ADMIN_CMS.md).`;
      return readableError(error).message;
    }
  }
  return null;
}

// The production rules the processor enforces (doc 12 §6), checked in the
// browser first so a file that would fail never leaves an empty draft behind.
// Returns a problem, or null (also when the browser cannot read the file:
// the processor then decides).
export async function precheck(type: ContentType, file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    if (type === "WALLPAPER") {
      const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve(null);
        image.src = url;
      });
      if (size && (size.width < 1080 || size.height < 2400))
        return `Too small: ${size.width}×${size.height}. Wallpapers must be at least 1080×2400.`;
      return null;
    }
    if (type === "RINGTONE" || type === "STATUS") {
      const seconds = await new Promise<number | null>((resolve) => {
        const media = document.createElement(type === "STATUS" ? "video" : "audio");
        const timer = setTimeout(() => resolve(null), 8000);
        media.preload = "metadata";
        media.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve(Number.isFinite(media.duration) ? media.duration : null);
        };
        media.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        media.src = url;
      });
      const [min, max, what] = type === "STATUS" ? [15, 30, "Status videos"] : [20, 30, "Ringtones"];
      if (seconds !== null && (seconds < min - 0.5 || seconds > max + 0.5))
        return `${what} must be ${min}–${max} seconds; this one is ${Math.round(seconds)} s.`;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function runUpload(
  row: UploadRow,
  deps: {
    api: AdminApi;
    panel: PanelApi;
    type: ContentType;
    defaults: BatchDefaults;
    // IDs taken in this batch, so two files never race for the same ID.
    taken: Set<string>;
    // Deities to recognise in folder and file names; the batch deity is the fallback.
    deities?: { value: string; label: string }[];
    check?: (type: ContentType, file: File) => Promise<string | null>;
  },
  update: (patch: Partial<UploadRow>) => void,
): Promise<void> {
  const { api, panel, type, defaults, taken, deities = [], check = precheck } = deps;
  let contentId = row.contentId;
  try {
    if (!contentId) {
      update({ stage: "creating", error: undefined, progress: 0 });
      const problem = await check(type, row.main);
      if (problem) {
        update({ stage: "error", error: problem });
        return;
      }
      const form = emptyForm(type);
      form.title = { hi: row.title.hi.trim(), en: row.title.en.trim() };
      if (hasLyrics(type)) form.lyrics = { hi: row.lyrics.hi.trim(), en: row.lyrics.en.trim() };
      const named = deitiesFromPath(row.main, deities);
      form.deityIds = named.length ? named : defaults.deityIds;
      form.audioLanguage = defaults.audioLanguage === "none" ? "" : defaults.audioLanguage;
      form.aiTool = defaults.aiTool.trim();
      form.aiPlan = defaults.aiPlan.trim();
      const draft = draftFromForm(form);
      for (let attempt = 1; !contentId; attempt++) {
        const candidate = (attempt === 1 ? row.id : `${row.id.slice(0, 56)}-${attempt}`).replace(/-+$/, "");
        if (taken.has(candidate)) continue;
        taken.add(candidate);
        try {
          await api.createContent(candidate, draft);
          contentId = candidate;
        } catch (error) {
          if (!codeOf(error).endsWith("already-exists") || attempt >= 30) throw error;
        }
      }
      update({ contentId });
    }

    update({ stage: "uploading", error: undefined, progress: 0 });
    const files: [MediaInputRole, File][] = [[roleOf(row.main.type as UploadMime), row.main]];
    if (row.extra) files.push([roleOf(row.extra.type as UploadMime), row.extra]);
    const total = files.reduce((sum, [, file]) => sum + file.size, 0) || 1;
    let sent = 0;
    const inputs: Partial<Record<MediaInputRole, string>> = {};
    for (const [role, file] of files) {
      const slot = await api.requestUploadUrl({
        contentId: contentId!,
        contentType: file.type as UploadMime,
        bytes: file.size,
      });
      await api.putFile(slot, file, (fraction) => update({ progress: (sent + fraction * file.size) / total }));
      sent += file.size;
      inputs[role] = slot.key;
    }

    update({ stage: "rendering", progress: 1 });
    const result = await panel.processMedia({ contentId: contentId!, inputs });
    const warnings = [...result.warnings];
    let ready = false;
    if (defaults.markReady) {
      try {
        await api.transitionContent({ contentId: contentId!, to: "READY" });
        ready = true;
      } catch (error) {
        warnings.push(`Kept as a draft: ${errorText(error)}`);
      }
    }
    update({
      stage: "done",
      media: result.media as MediaSet,
      durationSeconds: result.durationSeconds,
      warnings,
      ready,
    });
  } catch (error) {
    update({ stage: "error", error: errorText(error) });
  }
}

// One line for the row: the message plus any field problems.
export function errorText(error: unknown): string {
  const readable = readableError(error);
  const problems = readable.problems.map((problem) => `${problem.field}: ${problem.message}`).join("; ");
  return problems ? `${readable.message} ${problems}` : readable.message;
}

// Saves titles and lyrics changed after the upload onto the draft.
export async function saveRowText(
  api: AdminApi,
  contentId: string,
  text: { title?: { hi: string; en: string }; lyrics?: Lyrics },
) {
  const record = await api.getContent(contentId);
  if (!record) throw new Error("The item no longer exists.");
  const trim = (value: { hi: string; en: string }) => ({ hi: value.hi.trim(), en: value.en.trim() });
  await api.updateContent(contentId, {
    ...record.draft,
    ...(text.title ? { title: trim(text.title) } : {}),
    ...(text.lyrics ? { lyrics: trim(text.lyrics) } : {}),
  });
}

// Rows Gemini fills: one side has a title, the other is empty, and the row is
// not in the middle of an upload (the draft takes the title when created).
// An m4a waits for its tags first: the title tag may replace the file name.
export const needsLocalizing = (row: UploadRow) => {
  if (row.stage !== "waiting" && row.stage !== "error" && row.stage !== "done") return false;
  if (needsTags(row)) return false;
  const source = sourceSide(row.title);
  return !!source && row.title[source].trim().length <= 200;
};

export type LocalizedRow = { key: string; source: Side; sent: string; result: LocalizedText };

// Asks Gemini about every row that needs it, at most MAX_LOCALIZE_TITLES per
// call. Nothing is applied here: on a failure the rows stay as they are.
export async function localizeRowTitles(
  api: AdminApi,
  rows: UploadRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<LocalizedRow[]> {
  const pending = rows.filter(needsLocalizing).map((row) => {
    const source = sourceSide(row.title)!;
    return { key: row.key, source, sent: row.title[source].trim() };
  });
  const answers: LocalizedRow[] = [];
  for (let start = 0; start < pending.length; start += MAX_LOCALIZE_TITLES) {
    const batch = pending.slice(start, start + MAX_LOCALIZE_TITLES);
    const results = await api.localizeText({ kind: "title", items: batch.map((item) => item.sent) });
    batch.forEach((item, index) => {
      if (results[index]) answers.push({ ...item, result: results[index] });
    });
    onProgress?.(start + batch.length, pending.length);
  }
  return answers;
}

// Puts each answer on the right side of the latest rows. Sides the editor
// typed into are never overwritten, and a row whose title changed while
// Gemini was working is left alone. Rows whose draft exists are marked
// unsaved.
export function withLocalizedTitles(rows: UploadRow[], answers: LocalizedRow[]): { rows: UploadRow[]; count: number } {
  const byKey = new Map(answers.map((answer) => [answer.key, answer]));
  let count = 0;
  const next = rows.map((row) => {
    const answer = byKey.get(row.key);
    if (!answer || !needsLocalizing(row)) return row;
    const title = placeLocalized(row.title, answer.source, answer.sent, answer.result, row.typed);
    if (!title) return row;
    count += 1;
    return { ...row, title, titleUnsaved: row.contentId ? true : row.titleUnsaved };
  });
  return { rows: next, count };
}

// ---- Lyrics ----------------------------------------------------------------

// Rows Gemini writes the other side of the lyrics for: lyrics on one side
// only, tags read, and not already being written. Rows with both sides are
// never sent again (each call costs).
export const needsLyrics = (row: UploadRow, type: ContentType) => {
  if (!hasLyrics(type) || needsTags(row) || row.lyricsStatus === "writing") return false;
  if (row.stage !== "waiting" && row.stage !== "error" && row.stage !== "done") return false;
  const source = sourceSide(row.lyrics);
  return !!source && row.lyrics[source].trim().length <= LYRICS_MAX_LENGTH;
};

// Asks Gemini for the other side of one row's lyrics (one item per call).
// Nothing is applied here: on a failure the row stays as it is.
export async function localizeRowLyrics(api: AdminApi, row: UploadRow): Promise<LocalizedRow> {
  const source = sourceSide(row.lyrics);
  if (!source) throw new Error("Only lyrics with one side filled can be converted.");
  const sent = row.lyrics[source].trim();
  const [result] = await api.localizeText({ kind: "lyrics", items: [sent] });
  if (!result) throw new Error("Gemini sent no lyrics. Try again or type them in.");
  return { key: row.key, source, sent, result };
}

// Puts Gemini's lyrics on the latest row with the title rules: typed sides
// are kept and a row whose lyrics changed meanwhile is left alone. A row
// whose draft exists (or is being made) is marked unsaved. Null when
// nothing may change.
export function withLocalizedLyrics(row: UploadRow, answer: LocalizedRow): UploadRow | null {
  if (answer.key !== row.key) return null;
  const lyrics = placeLocalized(row.lyrics, answer.source, answer.sent, answer.result, row.lyricsTyped);
  if (!lyrics) return null;
  const drafted = !!row.contentId || (row.stage !== "waiting" && row.stage !== "error");
  return { ...row, lyrics, lyricsUnsaved: drafted || row.lyricsUnsaved };
}
