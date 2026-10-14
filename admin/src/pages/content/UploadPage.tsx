import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  BellRing,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  FlameKindling,
  Image,
  Loader2,
  Music4,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";
import { navigate, paths, sectionForType } from "../../app/router";
import { can, type ContentType, contentTypes } from "../../domain";
import { MultiDrop } from "../../components/panel/drop";
import { planItems, rolesFor, type Plan } from "../../components/panel/files";
import { SelectField, SwitchField, useDeityOptions } from "../../components/panel/inputs";
import { CreatableMultiSelect } from "../../components/panel/CreatableMultiSelect";
import { EmptyState, PageHeader } from "../../components/panel/page";
import { MediaThumb } from "../../components/panel/media";
import { AudioPlayer, audioVariant, isAudio, VisualTile } from "../../components/panel/preview";
import { typeInfo } from "./ContentLibraryPage";
import { localizeError } from "../../content/localize";
import { LyricsField } from "../../components/panel/LyricsField";
import {
  eachLimit,
  hasLyrics,
  localizeRowLyrics,
  localizeRowTitles,
  needsLocalizing,
  needsLyrics,
  needsTags,
  readRowTags,
  replanRow,
  runUpload,
  saveRowText,
  uploadsUnavailable,
  withLocalizedLyrics,
  withLocalizedTitles,
  withTags,
  type BatchDefaults,
  type UploadRow,
} from "./uploadPipeline";

const icons: Record<ContentType, LucideIcon> = {
  BHAJAN: Music4,
  AARTI: FlameKindling,
  MANTRA: AudioLines,
  CHALISA: BookOpenText,
  WALLPAPER: Image,
  RINGTONE: BellRing,
  STATUS: Clapperboard,
};
const hints: Record<ContentType, string> = {
  BHAJAN: "MP3, M4A, WAV or AAC. Album art inside the file becomes the cover; or add an image with the same name (song.mp3 + song.jpg). Covers can also be added later.",
  AARTI: "MP3, M4A, WAV or AAC. Album art inside the file becomes the cover; or add an image with the same name. Covers can also be added later.",
  MANTRA: "MP3, M4A, WAV or AAC. Album art inside the file becomes the cover; or add an image with the same name. Covers can also be added later.",
  CHALISA: "MP3, M4A, WAV or AAC. Album art inside the file becomes the cover; or add an image with the same name. Covers can also be added later.",
  RINGTONE: "MP3, M4A, WAV or AAC, 20–30 seconds each. A cover image with the same name is optional.",
  WALLPAPER: "PNG, JPG or WebP, at least 1080×2400 (1440×3200 is best).",
  STATUS: "Vertical MP4, 15–30 seconds. A poster image with the same name is optional; otherwise a frame from the video is used.",
};
const acceptFor = (type: ContentType) =>
  rolesFor(type).main === "image"
    ? "image/png,image/jpeg,image/webp"
    : rolesFor(type).main === "video"
      ? "video/mp4,image/png,image/jpeg,image/webp"
      : "audio/*,.mp3,.m4a,.wav,.aac,image/png,image/jpeg,image/webp";
const languages = [
  { value: "none", label: "Not set" },
  { value: "hi", label: "Hindi" },
  { value: "sa", label: "Sanskrit" },
  { value: "bho", label: "Bhojpuri" },
  { value: "pa", label: "Punjabi" },
  { value: "en", label: "English" },
];

function StageBadge({ row }: { row: UploadRow }) {
  const text = {
    waiting: "Waiting",
    creating: "Creating draft",
    uploading: `Uploading ${Math.round(row.progress * 100)}%`,
    rendering: "Rendering",
    done: row.ready ? "Ready" : "Draft saved",
    error: "Failed",
  }[row.stage];
  return (
    <Badge
      variant={row.stage === "error" ? "destructive" : row.stage === "done" ? "default" : "secondary"}
      className={cn("gap-1 whitespace-nowrap", row.stage === "done" && "bg-chart-4/25 text-foreground")}
    >
      {row.stage === "done" ? <CheckCircle2 className="size-3" /> : row.stage === "error" ? <AlertTriangle className="size-3" /> : row.stage !== "waiting" ? <Loader2 className="size-3 animate-spin" /> : null}
      {text}
    </Badge>
  );
}

export function UploadPage({ type: initialType }: { type?: ContentType }) {
  const { api, panel, role } = useAdmin();
  const [type, setType] = useState<ContentType>(initialType ?? "BHAJAN");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRowsState] = useState<UploadRow[]>([]);
  const rowsRef = useRef<UploadRow[]>([]);
  const taken = useRef(new Set<string>());
  const [skipped, setSkipped] = useState<Plan["skipped"]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<BatchDefaults>({ deityIds: [], audioLanguage: "none", aiTool: "", aiPlan: "", markReady: true });
  const deityOptions = useDeityOptions();

  const commit = (next: UploadRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  };
  const updateRow = (key: string, patch: Partial<UploadRow>) =>
    commit(rowsRef.current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Leaving mid-upload would strand half-made drafts.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const replan = (nextType: ContentType, all: File[]) => {
    const plan = planItems(nextType, all);
    // Keep rows already started; re-plan only the waiting ones, keeping what
    // they already have (titles, lyrics, tags, album art).
    const started = rowsRef.current.filter((row) => row.stage !== "waiting");
    const startedNames = new Set(started.map((row) => row.name));
    const waiting = new Map(rowsRef.current.filter((row) => row.stage === "waiting").map((row) => [row.name, row]));
    commit([
      ...started,
      ...plan.items.filter((item) => !startedNames.has(item.name)).map((item) => replanRow(item, waiting.get(item.name))),
    ]);
    setSkipped(plan.skipped);
  };
  // After files are added: read the m4a tags first (their titles replace
  // the file names), then Gemini fills the titles and lyrics.
  const prepare = async (forType: ContentType) => {
    await readTags(forType);
    void fillTitles(forType, true);
    void fillLyrics(forType, true);
  };
  const addFiles = (incoming: File[]) => {
    const known = new Set(files.map((file) => `${file.name}:${file.size}`));
    const all = [...files, ...incoming.filter((file) => !known.has(`${file.name}:${file.size}`))];
    setFiles(all);
    setNotice(null);
    replan(type, all);
    void prepare(type);
  };
  const chooseType = (next: ContentType) => {
    if (running) return;
    setType(next);
    replan(next, files);
    void prepare(next);
  };

  // Title, lyrics and album art from each m4a's tags, 4 files at a time.
  const [reading, setReading] = useState(0);
  const readingKeys = useRef(new Set<string>());
  const readTags = async (forType: ContentType) => {
    const pending = rowsRef.current.filter((row) => needsTags(row) && !readingKeys.current.has(row.key));
    if (!pending.length) return;
    const keys = new Set(pending.map((row) => row.key));
    keys.forEach((key) => readingKeys.current.add(key));
    if (hasLyrics(forType))
      commit(rowsRef.current.map((row) => (keys.has(row.key) ? { ...row, lyricsStatus: "reading" } : row)));
    setReading((count) => count + pending.length);
    await readRowTags(pending, (key, file, tags) => {
      readingKeys.current.delete(key);
      setReading((count) => count - 1);
      commit(
        rowsRef.current.map((row) => {
          if (row.key !== key) return row;
          const next = withTags(row, file, tags, forType);
          return next.lyricsStatus === "reading" ? { ...next, lyricsStatus: undefined } : next;
        }),
      );
    });
  };

  // Gemini writes the missing side of each row's lyrics (Hindi ⇄ Hinglish):
  // one call per row, two at a time, automatically after the tags are read
  // and again from the buttons. Typed sides are never replaced.
  const fillRowLyrics = async (key: string, forType: ContentType, quiet = false): Promise<"filled" | "skipped" | Error> => {
    const row = rowsRef.current.find((item) => item.key === key);
    if (!row || !needsLyrics(row, forType)) return "skipped";
    updateRow(key, { lyricsStatus: "writing" });
    try {
      const answer = await localizeRowLyrics(api, row);
      const latest = rowsRef.current.find((item) => item.key === key);
      if (!latest) return "skipped";
      const next = withLocalizedLyrics(latest, answer);
      commit(rowsRef.current.map((item) => (item.key !== key ? item : next ? { ...next, lyricsStatus: "done" } : { ...item, lyricsStatus: undefined })));
      return next ? "filled" : "skipped";
    } catch (error) {
      updateRow(key, { lyricsStatus: "failed" });
      if (!quiet) toast.error("Gemini could not write the lyrics", { id: "gemini-lyrics", description: localizeError(error) });
      return error instanceof Error ? error : new Error(String(error));
    }
  };
  const [writingLyrics, setWritingLyrics] = useState(false);
  const toFillLyrics = useMemo(() => rows.filter((row) => needsLyrics(row, type)).length, [rows, type]);
  const fillLyrics = async (forType: ContentType, auto: boolean) => {
    // Automatic runs skip rows that failed; the button retries them.
    const keys = rowsRef.current
      .filter((row) => needsLyrics(row, forType) && !(auto && row.lyricsStatus === "failed"))
      .map((row) => row.key);
    if (!keys.length) {
      if (!auto) toast.info("Every song with lyrics already has both Hindi and Hinglish.", { id: "gemini-lyrics" });
      return;
    }
    setWritingLyrics(true);
    let filled = 0;
    const failures: unknown[] = [];
    try {
      await eachLimit(keys, 2, async (key) => {
        const result = await fillRowLyrics(key, forType, true);
        if (result === "filled") filled += 1;
        else if (result instanceof Error) failures.push(result);
      });
    } finally {
      setWritingLyrics(false);
    }
    if (failures.length)
      toast.error(`Gemini could not write the lyrics for ${failures.length} song${failures.length === 1 ? "" : "s"}`, {
        id: "gemini-lyrics",
        description: `${localizeError(failures[0])} Those rows are unchanged; try “Fill lyrics with Gemini” again.`,
      });
    else if (filled) toast.success(`Gemini wrote the lyrics for ${filled} song${filled === 1 ? "" : "s"}. Check them before uploading.`, { id: "gemini-lyrics" });
  };
  const removeRow = (key: string) => {
    const row = rowsRef.current.find((item) => item.key === key);
    commit(rowsRef.current.filter((item) => item.key !== key));
    if (row) setFiles((all) => all.filter((file) => file !== row.main && file !== row.extra && file.name !== row.main.name && file.name !== row.extra?.name));
  };

  const start = async (only?: "failed") => {
    setRunning(true);
    setNotice(null);
    const problem = await uploadsUnavailable(api, panel);
    if (problem) {
      setNotice(problem);
      setRunning(false);
      return;
    }
    const queue = rowsRef.current
      .filter((row) => (only === "failed" ? row.stage === "error" : row.stage === "waiting" || row.stage === "error"))
      .map((row) => row.key);
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        const row = rowsRef.current.find((item) => item.key === key);
        if (row) await runUpload(row, { api, panel, type, defaults, taken: taken.current, deities: deityOptions }, (patch) => updateRow(key, patch));
      }
    };
    // Two at a time: fast enough, and gentle on the processor and the network.
    await Promise.all([worker(), worker()]);
    setRunning(false);
    const done = rowsRef.current.filter((row) => row.stage === "done").length;
    const failed = rowsRef.current.filter((row) => row.stage === "error").length;
    if (failed) toast.error(`${failed} of ${rowsRef.current.length} failed. Fix them and choose Retry failed.`);
    else if (done) {
      const ready = rowsRef.current.filter((row) => row.ready).length;
      toast.success(ready ? `${ready} of ${done} uploaded and READY to publish.` : `${done} drafts created with their media.`);
    }
  };

  // Gemini fills the empty side of each title (Hindi ⇄ Hinglish/English),
  // automatically after files are added and again from the button. Sides
  // the editor typed into are never replaced; on a failure nothing changes.
  const [filling, setFilling] = useState<{ done: number; total: number } | null>(null);
  const fillingRef = useRef(false);
  const fillAgain = useRef(false);
  const toFill = useMemo(() => rows.filter(needsLocalizing).length, [rows]);
  const fillTitles = async (forType: ContentType, auto: boolean) => {
    // Wallpaper names never reach the app.
    if (forType === "WALLPAPER") return;
    if (fillingRef.current) {
      fillAgain.current = true;
      return;
    }
    const total = rowsRef.current.filter(needsLocalizing).length;
    if (!total) {
      if (!auto) toast.info("Every title already has both Hindi and English.");
      return;
    }
    fillingRef.current = true;
    setFilling({ done: 0, total });
    try {
      const answers = await localizeRowTitles(api, rowsRef.current, (done) => setFilling({ done, total }));
      const next = withLocalizedTitles(rowsRef.current, answers);
      commit(next.rows);
      if (next.count) toast.success(`Gemini filled ${next.count} title${next.count === 1 ? "" : "s"}. Check them before uploading.`, { id: "gemini-titles" });
      else if (!auto) toast.info("Nothing to fill: the titles changed while Gemini was working.", { id: "gemini-titles" });
    } catch (error) {
      toast.error("Gemini could not fill the titles", { id: "gemini-titles", description: localizeError(error) });
    } finally {
      fillingRef.current = false;
      setFilling(null);
      if (fillAgain.current) {
        fillAgain.current = false;
        void fillTitles(forType, true);
      }
    }
  };

  const counts = useMemo(() => {
    const by = (stage: UploadRow["stage"]) => rows.filter((row) => row.stage === stage).length;
    return { waiting: by("waiting"), done: by("done"), failed: by("error"), total: rows.length };
  }, [rows]);
  const overall = rows.length ? rows.reduce((sum, row) => sum + (row.stage === "done" ? 1 : row.stage === "rendering" ? 0.9 : row.stage === "uploading" ? row.progress * 0.8 : 0), 0) / rows.length : 0;

  if (!can(role, "content.upload"))
    return <EmptyState icon={UploadCloud} title="Uploads need an editor role" text="Ask a super admin for EDITOR, CONTENT_ADMIN or SUPER_ADMIN." />;

  const info = typeInfo[type];
  return (
    <div className="pb-24">
      <PageHeader
        title="Upload"
        description="Drop one file, many files, a folder or a ZIP. Each file becomes a draft with its media ready; titles come from the file names, and the rest can be filled in later."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">1. What are you uploading?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="radiogroup" aria-label="Category">
            {contentTypes.map((value) => {
              const Icon = icons[value];
              const active = value === type;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={running}
                  onClick={() => chooseType(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <Icon className="size-6" />
                  {typeInfo[value].many}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <CreatableMultiSelect label="Deity" noun="deity" options={deityOptions} value={defaults.deityIds} onChange={(deityIds) => setDefaults({ ...defaults, deityIds })} max={10} hint="Files in a folder named after a deity (hanuman/…) or named like ganesh_02.jpg get that deity automatically; the rest get this one." />
            <SwitchField id="batch-ready" label="Mark READY when done" description="Each item goes to READY as soon as its media is rendered, so it only needs publishing. Items missing something stay as drafts." checked={defaults.markReady} onChange={(markReady) => setDefaults({ ...defaults, markReady })} />
            {isAudio(type) && (
              <SelectField id="batch-language" label="Language of the audio" value={defaults.audioLanguage} options={languages} onChange={(audioLanguage) => setDefaults({ ...defaults, audioLanguage })} />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">2. Add {info.many.toLowerCase()}</CardTitle>
          <CardDescription>{hints[type]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MultiDrop accept={acceptFor(type)} disabled={running} onFiles={addFiles} onError={(message) => toast.error(message)}>
            <p className="mt-1 text-sm text-muted-foreground">Nothing is published until you publish it.</p>
          </MultiDrop>
          {skipped.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 text-muted-foreground">
                  <AlertTriangle className="text-chart-2" /> {skipped.length} file{skipped.length === 1 ? "" : "s"} left out <ChevronDown />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-1 rounded-xl border bg-muted/30 p-3 text-sm">
                  {skipped.map((item) => (
                    <li key={item.name}><span className="font-medium">{item.name}</span>: {item.reason}</li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {notice && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>{notice}</p>
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Check and upload ({rows.length})</CardTitle>
            <CardDescription>
              {type === "WALLPAPER"
                ? "Names come from the file names; wallpapers need nothing else."
                : "Gemini fills the other language of each title from the file name; edit them if you like."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {type !== "WALLPAPER" && (
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={running || !!filling || toFill === 0}
                    onClick={() => void fillTitles(type, false)}
                  >
                    {filling ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {filling ? "Filling titles…" : "Fill titles with Gemini"}
                  </Button>
                  <p className="text-xs text-muted-foreground" role="status">
                    {filling
                      ? `Gemini is writing ${filling.total} title${filling.total === 1 ? "" : "s"} (${filling.done} of ${filling.total} done)…`
                      : toFill
                        ? `${toFill} title${toFill === 1 ? " has" : "s have"} only one language. Hindi gets its Hinglish spelling; English gets Hindi. Text you typed is kept.`
                        : "Every title has both Hindi and English."}
                  </p>
                </div>
                {filling && (
                  <Progress
                    value={Math.max(10, (filling.done / filling.total) * 100)}
                    className="mt-2 h-1 animate-pulse"
                    aria-label="Gemini progress"
                  />
                )}
                {hasLyrics(type) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={running || writingLyrics || reading > 0 || toFillLyrics === 0}
                      onClick={() => void fillLyrics(type, false)}
                    >
                      {writingLyrics ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      {writingLyrics ? "Writing lyrics…" : "Fill lyrics with Gemini"}
                    </Button>
                    <p className="text-xs text-muted-foreground" role="status">
                      {reading > 0
                        ? `Reading the tags of ${reading} m4a file${reading === 1 ? "" : "s"}…`
                        : writingLyrics
                          ? "Gemini is writing the other side of the lyrics, two songs at a time…"
                          : toFillLyrics
                            ? `${toFillLyrics} song${toFillLyrics === 1 ? " has" : "s have"} lyrics in one language only. Hindi lyrics get Hinglish; Hinglish gets Hindi.`
                            : "Lyrics come from the m4a tags; open a row to add or edit them."}
                    </p>
                  </div>
                )}
              </div>
            )}
            {rows.map((row) => (
              <UploadRowCard
                key={row.key}
                row={row}
                type={type}
                busy={running}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
                onSaved={() => updateRow(row.key, { titleUnsaved: false, lyricsUnsaved: false })}
                onFillLyrics={async () => {
                  await fillRowLyrics(row.key, type);
                }}
                api={api}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:left-[var(--sidebar-width)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
            <div className="min-w-48 flex-1">
              <p className="text-sm font-medium">
                {counts.done} of {counts.total} done{counts.failed ? ` · ${counts.failed} failed` : ""}{counts.waiting ? ` · ${counts.waiting} to go` : ""}
              </p>
              <Progress value={overall * 100} className="mt-1 h-1.5" aria-label="Overall progress" />
            </div>
            {counts.failed > 0 && !running && (
              <Button variant="outline" onClick={() => void start("failed")}><RotateCcw /> Retry failed</Button>
            )}
            {counts.done > 0 && !running && (
              <Button variant="outline" onClick={() => navigate(paths.page(sectionForType(type)))}><ExternalLink /> Open {info.many}</Button>
            )}
            {(running || counts.waiting > 0) && (
              <Button disabled={running || !!filling || reading > 0} onClick={() => void start()}>
                {running ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                {running ? "Uploading…" : `Upload ${counts.waiting} ${counts.waiting === 1 ? info.one : info.many.toLowerCase()}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadRowCard({
  row,
  type,
  busy,
  onChange,
  onRemove,
  onSaved,
  onFillLyrics,
  api,
}: {
  row: UploadRow;
  type: ContentType;
  busy: boolean;
  onChange: (patch: Partial<UploadRow>) => void;
  onRemove: () => void;
  onSaved: () => void;
  onFillLyrics: () => Promise<void>;
  api: ReturnType<typeof useAdmin>["api"];
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const done = row.stage === "done";
  const editable = row.stage === "waiting" || row.stage === "error" || done;
  const locked = !editable || (busy && !done);
  const songLyrics = hasLyrics(type);
  // The side typed into is the editor's: Gemini never overwrites it.
  const setTitle = (side: "hi" | "en", value: string) => {
    onChange({ title: { ...row.title, [side]: value }, typed: { ...row.typed, [side]: true } });
    if (done) setDirty(true);
  };
  const setLyrics = (lyrics: UploadRow["lyrics"]) => {
    const typed = { ...row.lyricsTyped };
    for (const side of ["hi", "en"] as const) if (lyrics[side] !== row.lyrics[side]) typed[side] = true;
    onChange({ lyrics, lyricsTyped: typed });
    if (done) setDirty(true);
  };
  const save = async () => {
    if (!row.contentId) return;
    setSaving(true);
    try {
      await saveRowText(api, row.contentId, { title: row.title, ...(songLyrics ? { lyrics: row.lyrics } : {}) });
      setDirty(false);
      onSaved();
      toast.success(songLyrics ? "Titles and lyrics saved" : "Titles saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  const title = row.title.en || row.title.hi || row.name;
  return (
    <div className={cn("rounded-xl border p-3", row.stage === "error" && "border-destructive/40 bg-destructive/5")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-3 lg:w-64">
          {done && !isAudio(type) ? (
            <VisualTile type={type} title={title} media={row.media} className="size-14" />
          ) : done && row.media?.thumb ? (
            <MediaThumb mediaKey={row.media.thumb.key} alt="" className="size-14 shrink-0" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <UploadCloud className="size-5 opacity-70" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={row.name}>{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.extra ? `+ ${row.extra.name}` : `${(row.main.size / 1048576).toFixed(1)} MB`}
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{row.contentId ?? row.id}</p>
          </div>
        </div>
        {type === "WALLPAPER" ? <div className="flex-1" /> : <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Input aria-label={`English title for ${row.name}`} value={row.title.en} disabled={locked} placeholder="English title" onChange={(event) => setTitle("en", event.target.value)} />
          <Input aria-label={`Hindi title for ${row.name}`} lang="hi" value={row.title.hi} disabled={locked} placeholder="हिन्दी शीर्षक" onChange={(event) => setTitle("hi", event.target.value)} />
        </div>}
        <div className="flex items-center gap-2 lg:w-72 lg:justify-end">
          {done && isAudio(type) && (
            <AudioPlayer iconOnly mediaKey={audioVariant(type, row.media)?.key} title={title} />
          )}
          <StageBadge row={row} />
          {done && (dirty || row.titleUnsaved || row.lyricsUnsaved) && (
            <Button size="sm" disabled={saving} onClick={() => void save()}><Save /> Save</Button>
          )}
          {done && row.contentId && (
            <Button variant="ghost" size="icon" aria-label={`Open ${title} in the editor`} onClick={() => navigate(paths.contentEdit(row.contentId!))}>
              <ExternalLink />
            </Button>
          )}
          {(row.stage === "waiting" || (row.stage === "error" && !row.contentId)) && !busy && (
            <Button variant="ghost" size="icon" aria-label={`Remove ${row.name}`} onClick={onRemove}><Trash2 /></Button>
          )}
        </div>
      </div>
      {(row.stage === "uploading" || row.stage === "rendering") && (
        <Progress value={row.stage === "rendering" ? 100 : row.progress * 100} className={cn("mt-2 h-1", row.stage === "rendering" && "animate-pulse")} aria-label={`Progress of ${row.name}`} />
      )}
      {row.coverFromFile && row.extra && !done && (
        <AlbumArt file={row.extra} name={row.name} disabled={locked} onRemove={() => onChange({ extra: undefined, coverFromFile: false })} />
      )}
      {songLyrics && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className={cn("text-xs", row.lyricsStatus === "failed" ? "text-destructive" : "text-muted-foreground")} aria-label={`Lyrics for ${row.name}`}>
            {lyricsSummary(row)}
          </p>
          <Button variant="ghost" size="xs" aria-expanded={lyricsOpen} onClick={() => setLyricsOpen(!lyricsOpen)}>
            {lyricsOpen ? "Hide lyrics" : row.lyrics.hi || row.lyrics.en ? "Edit lyrics" : "Add lyrics"}
            <ChevronDown className={cn("transition-transform", lyricsOpen && "rotate-180")} />
          </Button>
        </div>
      )}
      {songLyrics && lyricsOpen && (
        <fieldset disabled={locked} className="mt-3 rounded-lg border bg-muted/20 p-3">
          <LyricsField value={row.lyrics} onChange={setLyrics} onFillHinglish={onFillLyrics} busy={row.lyricsStatus === "writing" || locked} />
        </fieldset>
      )}
      {row.error && <p className="mt-2 text-sm text-destructive">{row.error}</p>}
      {done && row.warnings.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{row.warnings.join(" ")}</p>}
    </div>
  );
}

// "Lyrics: Hindi ✓ · Hinglish —", or what is happening to them.
function lyricsSummary(row: UploadRow): string {
  const has = (side: "hi" | "en") => (row.lyrics[side].trim() ? "✓" : "—");
  if (row.lyricsStatus === "reading") return "Lyrics: reading…";
  if (row.lyricsStatus === "writing") return `Lyrics: writing ${row.lyrics.hi.trim() ? "Hinglish" : "Hindi"}…`;
  if (!row.lyrics.hi.trim() && !row.lyrics.en.trim()) return row.lyricsStatus === "failed" ? "Lyrics: failed" : "Lyrics: none";
  const sides = `Lyrics: Hindi ${has("hi")} · Hinglish ${has("en")}`;
  return row.lyricsStatus === "done" ? `${sides} · done` : row.lyricsStatus === "failed" ? `${sides} · failed` : sides;
}

// The cover found inside the m4a, shown until the row is uploaded.
function AlbumArt({ file, name, disabled, onRemove }: { file: File; name: string; disabled: boolean; onRemove: () => void }) {
  // The object URL goes straight onto the <img> and is revoked with it.
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!image.current || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(file);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="mt-2 flex items-center gap-2">
      <img ref={image} alt={`Album art from ${name}`} className="h-10 w-[4.5rem] shrink-0 rounded-md border bg-muted object-cover" />
      <span className="text-xs text-muted-foreground">Album art from file</span>
      <Button variant="ghost" size="xs" disabled={disabled} aria-label={`Remove the album art of ${name}`} onClick={onRemove}>
        <Trash2 /> Remove
      </Button>
    </div>
  );
}
