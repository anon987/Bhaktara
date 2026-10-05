import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
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
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/panel/page";

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

export function ContentLibraryPage() {
  const { api, role } = useAdmin();
  const [status, setStatus] = useState<ContentStatus | "ALL">("ALL");
  const [type, setType] = useState<ContentType | "ALL">("ALL");
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
    return (rows ?? []).filter((row) => !q || `${row.title.en} ${row.title.hi} ${row.id}`.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div>
      <PageHeader
        title="Content library"
        description="Bhajans, aartis, mantras, chalisas, wallpapers, ringtones and status videos — from draft to published (D-036)."
        actions={
          can(role, "content.edit") && (
            <Button onClick={() => navigate(paths.contentNew)}>
              <Plus /> New content
            </Button>
          )
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
            <Input aria-label="Filter by title" placeholder="Filter by title or ID…" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={type} onValueChange={(value) => setType(value as ContentType | "ALL")}>
            <SelectTrigger aria-label="Type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {contentTypes.map((value) => (
                <SelectItem key={value} value={value} className="capitalize">{value.toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <ErrorState error={error} onRetry={() => void fetchPage(null)} />}
      {rows === null && !error && <LoadingState rows={8} />}
      {rows && visible.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No content here"
          text="Create an item, or bulk-import a manifest with npm run content:import."
          action={can(role, "content.edit") ? <Button onClick={() => navigate(paths.contentNew)}><Plus /> New content</Button> : undefined}
        />
      )}
      {visible.length > 0 && (
        <>
          <div className="space-y-2 md:hidden">
            {visible.map((row) => (
              <Card key={row.id} className="p-0">
                <a href={paths.contentEdit(row.id)} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.title.en || row.id}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.title.hi} · {(row.type ?? "untyped").toLowerCase()}</p>
                  </div>
                  <StatusPill status={row.status} />
                </a>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(paths.contentEdit(row.id))}>
                    <TableCell>
                      <a href={paths.contentEdit(row.id)} className="block font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                        {row.title.en || row.id}
                      </a>
                      <span className="text-xs text-muted-foreground">{row.title.hi}</span>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{(row.type ?? "untyped").toLowerCase()}</Badge></TableCell>
                    <TableCell><StatusPill status={row.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{row.scheduledAt ? formatDate(row.scheduledAt) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ago(row.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={busy} onClick={() => void fetchPage(next)}>{busy ? "Loading…" : "Load more"}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
