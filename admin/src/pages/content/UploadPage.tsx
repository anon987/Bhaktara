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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";
import { navigate, paths, sectionForType } from "../../app/router";
import { can, type ContentType, contentTypes } from "../../domain";
import { MultiDrop } from "../../components/panel/drop";
import { planItems, rolesFor, type Plan } from "../../components/panel/files";
import { ChipSelect, SelectField, useDeityOptions } from "../../components/panel/inputs";
import { EmptyState, PageHeader } from "../../components/panel/page";
import { MediaThumb } from "../../components/panel/media";
import { AudioPlayer, audioVariant, isAudio, VisualTile } from "../../components/panel/preview";
import { typeInfo } from "./ContentLibraryPage";
import { rowFromPlan, runUpload, saveTitles, uploadsUnavailable, type BatchDefaults, type UploadRow } from "./uploadPipeline";

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
    done: "Done",
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
  const [defaults, setDefaults] = useState<BatchDefaults>({ deityIds: [], audioLanguage: "none", aiTool: "", aiPlan: "" });
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
    // Keep rows already started; re-plan only the waiting ones.
    const started = rowsRef.current.filter((row) => row.stage !== "waiting");
    const startedNames = new Set(started.map((row) => row.name));
    commit([...started, ...plan.items.filter((item) => !startedNames.has(item.name)).map(rowFromPlan)]);
    setSkipped(plan.skipped);
  };
  const addFiles = (incoming: File[]) => {
    const known = new Set(files.map((file) => `${file.name}:${file.size}`));
    const all = [...files, ...incoming.filter((file) => !known.has(`${file.name}:${file.size}`))];
    setFiles(all);
    setNotice(null);
    replan(type, all);
  };
  const chooseType = (next: ContentType) => {
    if (running) return;
    setType(next);
    replan(next, files);
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
        if (row) await runUpload(row, { api, panel, type, defaults, taken: taken.current }, (patch) => updateRow(key, patch));
      }
    };
    // Two at a time: fast enough, and gentle on the processor and the network.
    await Promise.all([worker(), worker()]);
    setRunning(false);
    const done = rowsRef.current.filter((row) => row.stage === "done").length;
    const failed = rowsRef.current.filter((row) => row.stage === "error").length;
    if (failed) toast.error(`${failed} of ${rowsRef.current.length} failed. Fix them and choose Retry failed.`);
    else if (done) toast.success(`${done} drafts created with their media.`);
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
          <Collapsible className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2 text-muted-foreground">
                <ChevronDown /> Details for the whole batch (optional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 grid gap-4 md:grid-cols-2">
              <ChipSelect label="Deity" options={deityOptions} value={defaults.deityIds} onChange={(deityIds) => setDefaults({ ...defaults, deityIds })} hint="Applied to every item in this batch." />
              {isAudio(type) && (
                <SelectField id="batch-language" label="Language of the audio" value={defaults.audioLanguage} options={languages} onChange={(audioLanguage) => setDefaults({ ...defaults, audioLanguage })} />
              )}
              <div className="space-y-2">
                <Label htmlFor="batch-ai-tool">Made with (AI tool)</Label>
                <Input id="batch-ai-tool" value={defaults.aiTool} placeholder="e.g. Suno" onChange={(event) => setDefaults({ ...defaults, aiTool: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-ai-plan">AI plan</Label>
                <Input id="batch-ai-plan" value={defaults.aiPlan} placeholder="e.g. Pro" onChange={(event) => setDefaults({ ...defaults, aiPlan: event.target.value })} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">2. Add {info.many.toLowerCase()}</CardTitle>
          <CardDescription>{hints[type]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MultiDrop accept={acceptFor(type)} disabled={running} onFiles={addFiles} onError={(message) => toast.error(message)}>
            <p className="mt-1 text-sm text-muted-foreground">Everything lands as a draft; nothing is published.</p>
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
            <CardDescription>Edit the titles if you like; the Hindi title can also be added later in the editor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((row) => (
              <UploadRowCard
                key={row.key}
                row={row}
                type={type}
                busy={running}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
                onSaved={() => updateRow(row.key, { warnings: row.warnings })}
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
              <Button disabled={running} onClick={() => void start()}>
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
  api,
}: {
  row: UploadRow;
  type: ContentType;
  busy: boolean;
  onChange: (patch: Partial<UploadRow>) => void;
  onRemove: () => void;
  onSaved: () => void;
  api: ReturnType<typeof useAdmin>["api"];
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const done = row.stage === "done";
  const editable = row.stage === "waiting" || row.stage === "error" || done;
  const setTitle = (title: UploadRow["title"]) => {
    onChange({ title });
    if (done) setDirty(true);
  };
  const save = async () => {
    if (!row.contentId) return;
    setSaving(true);
    try {
      await saveTitles(api, row.contentId, row.title);
      setDirty(false);
      onSaved();
      toast.success("Titles saved");
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
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Input aria-label={`English title for ${row.name}`} value={row.title.en} disabled={!editable || busy && !done} placeholder="English title" onChange={(event) => setTitle({ ...row.title, en: event.target.value })} />
          <Input aria-label={`Hindi title for ${row.name}`} lang="hi" value={row.title.hi} disabled={!editable || busy && !done} placeholder="हिन्दी शीर्षक" onChange={(event) => setTitle({ ...row.title, hi: event.target.value })} />
        </div>
        <div className="flex items-center gap-2 lg:w-72 lg:justify-end">
          {done && isAudio(type) && (
            <AudioPlayer iconOnly mediaKey={audioVariant(type, row.media)?.key} title={title} />
          )}
          <StageBadge row={row} />
          {done && dirty && (
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
      {row.error && <p className="mt-2 text-sm text-destructive">{row.error}</p>}
      {done && row.warnings.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{row.warnings.join(" ")}</p>}
    </div>
  );
}
