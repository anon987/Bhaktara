import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Clock, Pencil, Plus, Search, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";
import { navigate, paths } from "../../app/router";
import { can, ContentStatus, contentStatuses, ContentType, contentTypes } from "../../domain";
import { readableError, type ReadableError } from "../../errors";
import type { ContentRow } from "../../api";
import { ago, formatDate } from "../../components/panel/format";
import { MediaThumb } from "../../components/panel/media";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import { AudioPlayer, audioVariant, clock, isAudio, VisualTile } from "../../components/panel/preview";

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
const titleOf = (row: ContentRow) => row.title.en || row.title.hi || row.id;

// One library: a section per content type (fixed `type`), or every type.
export function ContentLibraryPage({ type: fixedType }: { type?: ContentType }) {
  const { api, role } = useAdmin();
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL");
  const [chosenType, setChosenType] = useState<ContentType | "ALL">("ALL");
  const type = fixedType ?? chosenType;
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<ReadableError | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (after: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const page = await api.listContent({
          ...(status === "ALL" ? {} : { status }),
          ...(type === "ALL" ? {} : { type }),
          after,
          pageSize: 50,
        });
        setRows((current) => (after ? [...(current ?? []), ...page.items] : page.items));
        setNext(page.next);
      } catch (caught) {
        setError(readableError(caught));
      } finally {
        setBusy(false);
      }
    },
    [api, status, type],
  );
  useEffect(() => {
    const handle = setTimeout(() => void fetchPage(null), 0);
    return () => clearTimeout(handle);
  }, [fetchPage]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) => !q || `${row.title.en} ${row.title.hi} ${row.id} ${(row.deityIds ?? []).join(" ")}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const info = fixedType ? typeInfo[fixedType] : null;
  const newPath = fixedType ? paths.contentNewOf(fixedType) : paths.contentNew;
  const newLabel = info ? `New ${info.one}` : "New content";
  const writable = can(role, "content.edit");
  const canUpload = can(role, "content.upload");
  // File-first sections: uploading creates the drafts, so it leads.
  const uploadFirst = fixedType === "WALLPAPER" || fixedType === "RINGTONE" || fixedType === "STATUS";
  const uploadLabel = uploadFirst && info ? `Upload ${info.many.toLowerCase()}` : "Upload files";

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
      {visible.length > 0 &&
        (fixedType === "WALLPAPER" || fixedType === "STATUS" ? (
          <VisualGrid rows={visible} />
        ) : fixedType ? (
          <AudioList rows={visible} />
        ) : (
          <AllTable rows={visible} />
        ))}
      {visible.length > 0 && next && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={busy} onClick={() => void fetchPage(next)}>{busy ? "Loading…" : "Load more"}</Button>
        </div>
      )}
    </div>
  );
}

// Wallpapers and status videos: tall tiles that open the viewer.
function VisualGrid({ rows }: { rows: ContentRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <Card key={row.id} className="gap-0 overflow-hidden p-0">
          <VisualTile type={row.type} title={titleOf(row)} media={row.media} className="aspect-[9/16] rounded-none" />
          <div className="space-y-1.5 p-3">
            <a href={paths.contentEdit(row.id)} className="block truncate text-sm font-medium hover:underline">{titleOf(row)}</a>
            <p className="truncate text-xs text-muted-foreground">{row.title.hi || deityText(row.deityIds) || " "}</p>
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
function AudioList({ rows }: { rows: ContentRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const audio = audioVariant(row.type, row.media);
        const duration = row.durationSeconds ?? audio?.durationSeconds ?? null;
        return (
          <Card key={row.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <MediaThumb mediaKey={row.media?.thumb?.key} alt="" className="size-14 shrink-0" />
              <div className="min-w-0">
                <a href={paths.contentEdit(row.id)} className="block truncate font-medium hover:underline">{titleOf(row)}</a>
                <p className="truncate text-sm text-muted-foreground">{row.title.hi}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {deityText(row.deityIds) && <span>{deityText(row.deityIds)}</span>}
                  {duration != null && (
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{clock(duration)}</span>
                  )}
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

function AllTable({ rows }: { rows: ContentRow[] }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <Card key={row.id} className="flex flex-row items-center gap-3 p-3">
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
              <TableRow key={row.id}>
                <TableCell><Preview row={row} /></TableCell>
                <TableCell>
                  <a href={paths.contentEdit(row.id)} className="block font-medium hover:underline">{titleOf(row)}</a>
                  <span className="text-xs text-muted-foreground">{row.title.hi}</span>
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
