import { useCallback, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { CatalogKind } from "../../../../src/domain/admin";
import { useAdmin } from "../../app/context";
import { can } from "../../domain";
import { ConfirmAction } from "../../components/panel/confirm";
import { ago } from "../../components/panel/format";
import { MediaThumb } from "../../components/panel/media";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../components/panel/page";
import { useAction } from "../../components/panel/useAction";
import { useLoad } from "../../useLoad";
import type { CatalogRow } from "../../panelApi";
import { kindDefs } from "./kinds";

type Filter = "all" | "on" | "off";

// One page for every catalogue kind: searchable cards and a side editor.
export function CatalogPage({ kind }: { kind: CatalogKind }) {
  const def = kindDefs[kind];
  const { panel, role } = useAdmin();
  const writable = can(role, "catalog.write");
  const [reload, setReload] = useState(0);
  const load = useCallback(() => panel.listCatalog(kind), [panel, kind, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, loading } = useLoad<CatalogRow[]>(load);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState("all");
  const [editing, setEditing] = useState<{ id?: string; form: unknown } | null>(null);

  const rows = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) => def.sort(a.data, b.data));
    return list
      .map((row) => ({ row, view: def.row(row.data), group: def.group?.of(row.data) ?? "" }))
      .filter(({ row, view, group: rowGroup }) => {
        const text = `${view.title} ${view.subtitle ?? ""} ${row.id}`.toLowerCase();
        if (search && !text.includes(search.toLowerCase())) return false;
        if (group !== "all" && rowGroup !== group) return false;
        const on = view.badges[0]?.tone === "on";
        return filter === "all" || (filter === "on" ? on : !on);
      });
  }, [data, def, search, filter, group]);
  // With a grouping and no group chosen: one heading per group that has rows.
  const sections = def.group && group === "all"
    ? def.group.options
        .map((option) => ({ ...option, rows: rows.filter((item) => item.group === option.value) }))
        .filter((section) => section.rows.length > 0)
    : [{ value: "all", label: "", rows }];

  const save = useAction(
    async () => {
      if (!editing) return;
      await panel.saveCatalogItem({
        kind,
        ...(editing.id ? { id: editing.id } : {}),
        create: !editing.id,
        data: def.toInput(editing.form),
      });
      setEditing(null);
      setReload((n) => n + 1);
    },
    { success: `${def.singular[0].toUpperCase()}${def.singular.slice(1)} saved` },
  );
  const remove = useAction(
    async (id: string) => {
      await panel.deleteCatalogItem({ kind, id });
      setEditing(null);
      setReload((n) => n + 1);
    },
    { success: "Deleted" },
  );
  const deletable = kind !== "deity" && kind !== "category";

  return (
    <div>
      <PageHeader
        title={def.title}
        description={def.description}
        actions={
          writable && (
            <Button onClick={() => setEditing({ form: def.empty() })}>
              <Plus /> New {def.singular}
            </Button>
          )
        }
      />
      {kind === "challenge" && data && <CoverageStrip rows={data} />}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={`Search ${def.title.toLowerCase()}`}
            placeholder={`Search ${def.title.toLowerCase()}…`}
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(value) => value && setFilter(value as Filter)}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="on">Live</ToggleGroupItem>
          <ToggleGroupItem value="off">Off</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {def.group && (
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={def.group.label}
          className="mb-4 flex-wrap"
          value={group}
          onValueChange={(value) => value && setGroup(value)}
        >
          <ToggleGroupItem value="all">All kinds</ToggleGroupItem>
          {def.group.options.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {error && <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />}
      {loading && !data && <LoadingState />}
      {data && rows.length === 0 && (
        <EmptyState
          icon={def.icon}
          title={data.length === 0 ? `No ${def.title.toLowerCase()} yet` : "Nothing matches"}
          text={data.length === 0 ? def.description : "Try another search or filter."}
          action={
            writable && data.length === 0 ? (
              <Button onClick={() => setEditing({ form: def.empty() })}>
                <Plus /> New {def.singular}
              </Button>
            ) : undefined
          }
        />
      )}
      {sections.map((section) => (
        <section key={section.value} aria-label={section.label || undefined} className="mb-6">
          {section.label && (
            <h2 className="mb-3 flex items-baseline gap-2 font-display text-lg">
              {section.label} <span className="text-sm font-normal text-muted-foreground">{section.rows.length}</span>
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.rows.map(({ row, view }) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setEditing({ id: row.id, form: def.fromDoc(row.data) })}
                className="text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                <Card className="flex h-full flex-row items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                  {view.thumb !== undefined ? (
                    <MediaThumb mediaKey={view.thumb} alt={view.title} className="size-16 shrink-0" />
                  ) : (
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <def.icon className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate font-medium">{view.title}</p>
                    {view.subtitle && <p className="truncate text-sm text-muted-foreground">{view.subtitle}</p>}
                    <div className="flex flex-wrap gap-1">
                      {view.badges.map((badge) => (
                        <Badge
                          key={badge.label}
                          variant={badge.tone === "on" ? "default" : badge.tone === "info" ? "secondary" : "outline"}
                          className="font-normal"
                        >
                          {badge.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <span className="hidden self-start text-[11px] text-muted-foreground sm:block">{ago(row.updatedAt)}</span>
                </Card>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle className="font-display text-xl">
              {editing?.id ? `Edit ${def.singular}` : `New ${def.singular}`}
            </SheetTitle>
            <SheetDescription>{editing?.id ? <code className="text-xs">{editing.id}</code> : def.description}</SheetDescription>
          </SheetHeader>
          {editing && (
            <form
              id="catalog-form"
              className="space-y-5 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save.run();
              }}
            >
              <fieldset disabled={!writable || save.busy} className="space-y-5">
                <def.Form value={editing.form} onChange={(form: unknown) => setEditing({ ...editing, form })} />
              </fieldset>
              {save.error && <ErrorState error={save.error} />}
            </form>
          )}
          <SheetFooter className={cn("sticky bottom-0 flex-row justify-between border-t bg-background")}>
            {editing?.id && writable && deletable ? (
              <ConfirmAction
                trigger={
                  <Button type="button" variant="ghost" className="text-destructive">
                    <Trash2 /> Delete
                  </Button>
                }
                title={`Delete this ${def.singular}?`}
                description="It disappears from the app. The audit log keeps a record."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  if (editing.id) await remove.run(editing.id);
                }}
              />
            ) : (
              <span />
            )}
            {writable && (
              <Button type="submit" form="catalog-form" disabled={save.busy}>
                {save.busy ? "Saving…" : "Save"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Eight weeks of challenge coverage: each day lit when a daily challenge is
// live, with weekly challenges shown as a band (doc 09 §10 "calendar view").
function CoverageStrip({ rows }: { rows: CatalogRow[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 56 }, (_, i) => new Date(today.getTime() + i * 86400000));
  const ranges = rows
    .filter((row) => row.data.isActive !== false)
    .map((row) => {
      const toMs = (value: unknown) =>
        value && typeof (value as { toMillis?: unknown }).toMillis === "function"
          ? (value as { toMillis(): number }).toMillis()
          : 0;
      return { period: row.data.period, start: toMs(row.data.startAt), end: toMs(row.data.endAt) };
    });
  const covered = (day: Date, period: string) =>
    ranges.some((r) => r.period === period && r.start <= day.getTime() + 86399999 && r.end > day.getTime());
  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium">Next 8 weeks</span>
        <span className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" /> daily</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-chart-2" /> weekly</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted" /> gap</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(28,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(56,minmax(0,1fr))]">
        {days.map((day) => (
          <div key={day.toISOString()} className="space-y-1" title={day.toDateString()}>
            <div className={cn("h-5 rounded-sm", covered(day, "DAILY") ? "bg-primary" : "bg-muted")} />
            <div className={cn("h-1.5 rounded-sm", covered(day, "WEEKLY") ? "bg-chart-2" : "bg-muted")} />
          </div>
        ))}
      </div>
    </Card>
  );
}
