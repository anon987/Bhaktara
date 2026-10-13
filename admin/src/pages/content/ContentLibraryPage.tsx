import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Clock, Pencil, Plus, Search, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";
import { navigate, paths } from "../../app/router";
import { can, ContentStatus, contentStatuses, ContentType, contentTypes } from "../../domain";
import { readableError, type ReadableError } from "../../errors";
import { MAX_PAGE_SIZE, type ContentRow } from "../../api";
import { useDeityPicker } from "../../content/taxonomy";
import { ago, formatDate } from "../../components/panel/format";
import { MediaThumb } from "../../components/panel/media";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import { AudioPlayer, audioVariant, clock, isAudio, VisualTile } from "../../components/panel/preview";
import {
  actionApplies,
  actionFor,
  ANY_DEITY,
  bulkClient,
  failureReason,
  filterRows,
  NO_DEITY,
  rowAfter,
  rowProblems,
  runBulk,
  sortRows,
  summaryText,
  titleOf,
  toggleSelection,
  type BulkActionId,
  type BulkRun,
  type SortKey,
} from "./bulk";
import { BulkBar, type RunExtra, type Running } from "./BulkBar";

const statusTone: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  READY: "bg-chart-2/20 text-foreground",
  SCHEDULED: "bg-chart-5/20 text-foreground",
  PUBLISHED: "bg-chart-4/25 text-foreground",
  ARCHIVED: "bg-secondary text-muted-foreground",
};
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusTone[status])}>
      {(status ?? "unknown").toLowerCase()}
    </span>
  );
}

export const typeInfo: Record<ContentType, { one: string; many: string; description: string }> = {
  BHAJAN: { one: "bhajan", many: "Bhajans", description: "Devotional songs. Press play to listen before publishing." },
  AARTI: { one: "aarti", many: "Aartis", description: "Aartis for each deity; the Mandir and the puja play them." },
  MANTRA: { one: "mantra", many: "Mantras", description: "Mantra chants for listening and jaap." },
  CHALISA: { one: "chalisa", many: "Chalisas", description: "Chalisa recitations; sacred text needs its source on record." },
  WALLPAPER: { one: "wallpaper", many: "Wallpapers", description: "Phone wallpapers. Open one to see it full size and check each size." },
  RINGTONE: { one: "ringtone", many: "Ringtones", description: "Short ringtones (MP3). Press play to check the loop and the volume." },
  STATUS: { one: "status video", many: "Status videos", description: "Vertical WhatsApp status videos. Open one to watch it." },
};
const deityText = (ids?: string[]) =>
  (ids ?? []).map((id) => id.charAt(0).toUpperCase() + id.slice(1)).join(", ");

// One library: a section per content type (fixed `type`), or every type.
// Items can be selected (click, shift-click for a range, select all) and
// changed together from the bulk bar at the bottom.
export function ContentLibraryPage({ type: fixedType }: { type?: ContentType }) {
  const { api, role } = useAdmin();
  const callBulk = useMemo(() => bulkClient(api), [api]);
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL");
  const [chosenType, setChosenType] = useState<ContentType | "ALL">("ALL");
  const type = fixedType ?? chosenType;
  const [search, setSearch] = useState("");
  const [deity, setDeity] = useState(ANY_DEITY);
  const [attention, setAttention] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<ReadableError | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [running, setRunning] = useState<Running | null>(null);
  const [run, setRun] = useState<BulkRun | null>(null);
  const deityOptions = useDeityPicker().options;

  const serverQuery = useMemo(
    () => ({ ...(status === "ALL" ? {} : { status }), ...(type === "ALL" ? {} : { type }) }),
    [status, type],
  );
  const fetchPage = useCallback(
    async (after: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const page = await api.listContent({ ...serverQuery, after, pageSize: 50 });
        setRows((current) => (after ? [...(current ?? []), ...page.items] : page.items));
        setNext(page.next);
      } catch (caught) {
        setError(readableError(caught));
      } finally {
        setBusy(false);
      }
    },
    [api, serverQuery],
  );
  useEffect(() => {
    const handle = setTimeout(() => void fetchPage(null), 0);
    return () => clearTimeout(handle);
  }, [fetchPage]);

  // A new filter is a new list: the selection starts again ("Load more"
  // keeps it).
  const filter = useMemo(() => ({ search, deity, attention }), [search, deity, attention]);
  const filterKey = `${type}|${status}|${search}|${deity}|${attention}`;
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (seenFilter !== filterKey) {
    setSeenFilter(filterKey);
    setSelected(new Set());
    setAnchor(null);
  }

  const visible = useMemo(() => sortRows(filterRows(rows ?? [], filter), sort), [rows, filter, sort]);
  const order = useMemo(() => visible.map((row) => row.id), [visible]);
  const selectedRows = useMemo(() => (rows ?? []).filter((row) => selected.has(row.id)), [rows, selected]);
  const shownSelected = visible.filter((row) => selected.has(row.id)).length;

  const info = fixedType ? typeInfo[fixedType] : null;
  const newPath = fixedType ? paths.contentNewOf(fixedType) : paths.contentNew;
  const newLabel = info ? `New ${info.one}` : "New content";
  const writable = can(role, "content.edit");
  const canUpload = can(role, "content.upload");
  // File-first sections: uploading creates the drafts, so it leads.
  const uploadFirst = fixedType === "WALLPAPER" || fixedType === "RINGTONE" || fixedType === "STATUS";
  const uploadLabel = uploadFirst && info ? `Upload ${info.many.toLowerCase()}` : "Upload files";

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);
  const toggle = (id: string, shift: boolean) => {
    setSelected((current) => toggleSelection(current, order, id, anchor, shift));
    setAnchor(id);
  };
  const toggleShown = () =>
    setSelected((current) => {
      const nextSet = new Set(current);
      const all = visible.every((row) => current.has(row.id));
      for (const row of visible) {
        if (all) nextSet.delete(row.id);
        else nextSet.add(row.id);
      }
      return nextSet;
    });

  // Loads the remaining pages for the current filters, then selects every
  // matching item.
  const selectAllMatching = async () => {
    setLoadingAll(true);
    try {
      let all = rows ?? [];
      let cursor = next;
      while (cursor) {
        const page = await api.listContent({ ...serverQuery, after: cursor, pageSize: MAX_PAGE_SIZE });
        all = [...all, ...page.items];
        cursor = page.next;
      }
      setRows(all);
      setNext(null);
      setSelected(new Set(filterRows(all, filter).map((row) => row.id)));
    } catch (caught) {
      toast.error(readableError(caught).message);
    } finally {
      setLoadingAll(false);
    }
  };

  // Esc clears the selection (open dialogs handle Esc themselves).
  useEffect(() => {
    if (!selected.size || running) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.size, running, clear]);

  const execute = async (id: BulkActionId, extra?: RunExtra) => {
    const chosen = selectedRows;
    const targets = chosen.filter((row) => actionApplies(id, row.status, role));
    const action = actionFor(id, extra);
    setRun(null);
    setRunning({ actionId: id, done: 0, total: targets.length });
    const results = await runBulk(
      callBulk,
      targets.map((row) => row.id),
      action,
      (done, total) => setRunning({ actionId: id, done, total }),
    );
    const byId = new Map(results.map((result) => [result.id, result]));
    setRows((current) =>
      (current ?? []).flatMap((row) => {
        const result = byId.get(row.id);
        if (!result?.ok) return [row];
        const after = rowAfter(row, action, result);
        return after ? [after] : [];
      }),
    );
    const titles = new Map(chosen.map((row) => [row.id, titleOf(row)]));
    const failed = results
      .filter((result) => !result.ok)
      .map((result) => ({ id: result.id, title: titles.get(result.id) ?? result.id, reason: failureReason(result) }));
    const summary: BulkRun = {
      actionId: id,
      done: results.length - failed.length,
      skipped: chosen.length - targets.length,
      failed,
    };
    setRunning(null);
    setRun(summary);
    // Failed items stay selected so they can be fixed and retried.
    setSelected(new Set(failed.map((item) => item.id)));
    setAnchor(null);
    if (failed.length) toast.warning(summaryText(summary));
    else toast.success(summaryText(summary));
  };

  const selection: SelectionProps = {
    selectable: writable,
    selected,
    any: selected.size > 0,
    onToggle: toggle,
  };

  return (
    <div>
      <PageHeader
        title={info?.many ?? "All content"}
        description={
          info?.description ??
          "Every bhajan, aarti, mantra, chalisa, wallpaper, ringtone and status video, from draft to published (D-036)."
        }
        actions={
          <>
            {canUpload && !uploadFirst && (
              <Button variant="outline" onClick={() => navigate(paths.upload(fixedType))}>
                <UploadCloud /> {uploadLabel}
              </Button>
            )}
            {writable && (
              <Button variant={uploadFirst && canUpload ? "outline" : "default"} onClick={() => navigate(newPath)}>
                <Plus /> {newLabel}
              </Button>
            )}
            {canUpload && uploadFirst && (
              <Button onClick={() => navigate(paths.upload(fixedType))}>
                <UploadCloud /> {uploadLabel}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={status} onValueChange={(value) => setStatus(value as ContentStatus | "ALL")}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="ALL">All</TabsTrigger>
            {contentStatuses.map((value) => (
              <TabsTrigger key={value} value={value} className="capitalize">{value.toLowerCase()}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Filter by title or deity" placeholder="Filter by title, deity or ID…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {!fixedType && (
            <Select value={chosenType} onValueChange={(value) => setChosenType(value as ContentType | "ALL")}>
              <SelectTrigger aria-label="Type" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {contentTypes.map((value) => (
                  <SelectItem key={value} value={value}>{typeInfo[value].many}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={deity} onValueChange={setDeity}>
          <SelectTrigger aria-label="Deity" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_DEITY}>Every deity</SelectItem>
            <SelectItem value={NO_DEITY}>No deity yet</SelectItem>
            {deityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}{option.hint ? ` · ${option.hint}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={attention ? "default" : "outline"}
          aria-pressed={attention}
          onClick={() => setAttention((value) => !value)}
          title="Items without a deity, and drafts missing a title or media"
        >
          <AlertTriangle /> Needs attention
        </Button>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger aria-label="Sort" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="title">Title (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && <ErrorState error={error} onRetry={() => void fetchPage(null)} />}
      {rows === null && !error && <LoadingState rows={8} />}
      {rows && visible.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={info ? `No ${info.many.toLowerCase()} here` : "No content here"}
          text="Create an item, or bulk-import a manifest with npm run content:import."
          action={
            uploadFirst && canUpload ? (
              <Button onClick={() => navigate(paths.upload(fixedType))}><UploadCloud /> {uploadLabel}</Button>
            ) : writable ? (
              <Button onClick={() => navigate(newPath)}><Plus /> {newLabel}</Button>
            ) : undefined
          }
        />
      )}
      {writable && visible.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
          <label className="flex min-h-9 cursor-pointer items-center gap-2.5 font-medium">
            <Checkbox
              className="size-5"
              aria-label={`Select all ${visible.length} shown`}
              checked={shownSelected === visible.length ? true : shownSelected ? "indeterminate" : false}
              onCheckedChange={toggleShown}
            />
            {shownSelected === visible.length ? `All ${visible.length} shown selected` : `Select all ${visible.length} shown`}
          </label>
          {next && (
            <Button size="sm" variant="ghost" disabled={loadingAll || !!running} onClick={() => void selectAllMatching()}>
              {loadingAll ? "Loading the rest…" : "Select all matching (loads the rest)"}
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            Shift-click selects a range · Esc clears
          </span>
        </div>
      )}
      {visible.length > 0 &&
        (fixedType === "WALLPAPER" || fixedType === "STATUS" ? (
          <VisualGrid rows={visible} {...selection} />
        ) : fixedType ? (
          <AudioList rows={visible} {...selection} />
        ) : (
          <AllTable rows={visible} {...selection} />
        ))}
      {visible.length > 0 && next && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={busy || loadingAll} onClick={() => void fetchPage(next)}>{busy ? "Loading…" : "Load more"}</Button>
        </div>
      )}
      <BulkBar
        selected={selectedRows}
        role={role}
        running={running}
        run={run}
        onRun={(id, extra) => void execute(id, extra)}
        onClear={clear}
        onDismissRun={() => setRun(null)}
      />
    </div>
  );
}

type SelectionProps = {
  selectable: boolean;
  selected: ReadonlySet<string>;
  any: boolean;
  onToggle: (id: string, shift: boolean) => void;
};

// A row's checkbox: shown on hover (and on touch screens), always once
// anything is selected. The hit area is larger than the box.
function SelectBox({ row, selected, any, onToggle, className }: Omit<SelectionProps, "selectable"> & { row: ContentRow; className?: string }) {
  const checked = selected.has(row.id);
  return (
    <Checkbox
      checked={checked}
      aria-label={`Select ${titleOf(row)}`}
      onClick={(event) => {
        event.preventDefault();
        onToggle(row.id, event.shiftKey);
      }}
      className={cn(
        "relative size-6 rounded-md bg-background/90 shadow-sm after:absolute after:-inset-2 after:content-['']",
        !any && !checked && "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    />
  );
}

function AttentionHint({ row }: { row: ContentRow }) {
  const problems = rowProblems(row);
  if (!problems.length) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title={problems.join(", ")}>
      <AlertTriangle className="size-3" aria-hidden /> {problems.join(", ")}
    </span>
  );
}

// Wallpapers and status videos: tall tiles that open the viewer.
function VisualGrid({ rows, selectable, ...selection }: { rows: ContentRow[] } & SelectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <Card
          key={row.id}
          className={cn("group/item relative gap-0 overflow-hidden p-0", selection.selected.has(row.id) && "ring-2 ring-primary")}
        >
          <VisualTile type={row.type} title={titleOf(row)} media={row.media} className="aspect-[9/16] rounded-none" />
          {selectable && <SelectBox row={row} {...selection} className="absolute left-2.5 top-2.5 z-10" />}
          <div className="space-y-1.5 p-3">
            <a href={paths.contentEdit(row.id)} className="block truncate text-sm font-medium hover:underline">{titleOf(row)}</a>
            <p className="truncate text-xs text-muted-foreground">{row.title.hi || deityText(row.deityIds) || " "}</p>
            <div className="flex items-center justify-between gap-2">
              <StatusPill status={row.status} />
              <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit ${titleOf(row)}`} onClick={() => navigate(paths.contentEdit(row.id))}>
                <Pencil />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Bhajans, aartis, mantras, chalisas and ringtones: rows with a player.
function AudioList({ rows, selectable, ...selection }: { rows: ContentRow[] } & SelectionProps) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const audio = audioVariant(row.type, row.media);
        const duration = row.durationSeconds ?? audio?.durationSeconds ?? null;
        return (
          <Card
            key={row.id}
            className={cn("group/item flex flex-col gap-3 p-3 sm:flex-row sm:items-center", selection.selected.has(row.id) && "ring-2 ring-primary")}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {selectable && <SelectBox row={row} {...selection} className="shrink-0" />}
              <MediaThumb mediaKey={row.media?.thumb?.key} alt="" className="size-14 shrink-0" />
              <div className="min-w-0">
                <a href={paths.contentEdit(row.id)} className="block truncate font-medium hover:underline">{titleOf(row)}</a>
                <p className="truncate text-sm text-muted-foreground">{row.title.hi}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {deityText(row.deityIds) && <span>{deityText(row.deityIds)}</span>}
                  {duration != null && (
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{clock(duration)}</span>
                  )}
                  <AttentionHint row={row} />
                </p>
              </div>
            </div>
            <AudioPlayer mediaKey={audio?.key} title={titleOf(row)} duration={duration} compact className="sm:w-72" />
            <div className="flex items-center justify-between gap-2 sm:w-36 sm:justify-end">
              <StatusPill status={row.status} />
              <Button variant="ghost" size="icon" aria-label={`Edit ${titleOf(row)}`} onClick={() => navigate(paths.contentEdit(row.id))}>
                <Pencil />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Every type: a table with a thumbnail and the right preview for each row.
function Preview({ row }: { row: ContentRow }) {
  if (isAudio(row.type))
    return <AudioPlayer iconOnly mediaKey={audioVariant(row.type, row.media)?.key} title={titleOf(row)} />;
  return <VisualTile type={row.type} title={titleOf(row)} media={row.media} className="size-10" />;
}

function AllTable({ rows, selectable, ...selection }: { rows: ContentRow[] } & SelectionProps) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <Card
            key={row.id}
            className={cn("group/item flex flex-row items-center gap-3 p-3", selection.selected.has(row.id) && "ring-2 ring-primary")}
          >
            {selectable && <SelectBox row={row} {...selection} className="shrink-0" />}
            <Preview row={row} />
            <a href={paths.contentEdit(row.id)} className="min-w-0 flex-1">
              <p className="truncate font-medium">{titleOf(row)}</p>
              <p className="truncate text-xs text-muted-foreground">{row.title.hi} · {row.type ? typeInfo[row.type].one : "untyped"}</p>
            </a>
            <StatusPill status={row.status} />
          </Card>
        ))}
      </div>
      <Card className="hidden overflow-hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead className="w-12"><span className="sr-only">Selected</span></TableHead>}
              <TableHead className="w-14"><span className="sr-only">Preview</span></TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="group/item"
                data-state={selection.selected.has(row.id) ? "selected" : undefined}
              >
                {selectable && <TableCell><SelectBox row={row} {...selection} /></TableCell>}
                <TableCell><Preview row={row} /></TableCell>
                <TableCell>
                  <a href={paths.contentEdit(row.id)} className="block font-medium hover:underline">{titleOf(row)}</a>
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span>{row.title.hi}</span>
                    <AttentionHint row={row} />
                  </span>
                </TableCell>
                <TableCell><Badge variant="secondary">{row.type ? typeInfo[row.type].one : "untyped"}</Badge></TableCell>
                <TableCell><StatusPill status={row.status} /></TableCell>
                <TableCell className="text-muted-foreground">{row.scheduledAt ? formatDate(row.scheduledAt) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{ago(row.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
