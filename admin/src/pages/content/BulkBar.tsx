import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  PencilLine,
  Rocket,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ContentRow } from "../../api";
import { paths } from "../../app/router";
import { ConfirmAction } from "../../components/panel/confirm";
import { CreatableMultiSelect } from "../../components/panel/CreatableMultiSelect";
import { useCategoryPicker, useDeityPicker, useTagPicker } from "../../content/taxonomy";
import type { AdminRole } from "../../domain";
import {
  actionApplies,
  actionVisible,
  bulkAction,
  emptyDetailsForm,
  patchFromForm,
  summaryText,
  type BulkActionId,
  type BulkPatch,
  type BulkRun,
  type DetailsForm,
  type ListMode,
  type Tri,
} from "./bulk";

export type Running = { actionId: BulkActionId; done: number; total: number };
export type RunExtra = { scheduledAt?: string; patch?: BulkPatch };

const icons: Record<BulkActionId, LucideIcon> = {
  ready: CheckCircle2,
  publish: Rocket,
  schedule: CalendarClock,
  draft: Undo2,
  archive: Archive,
  restore: ArchiveRestore,
  edit: PencilLine,
  delete: Trash2,
};
const order: BulkActionId[] = ["ready", "publish", "schedule", "draft", "archive", "restore", "edit", "delete"];
const plural = (count: number) => `${count} item${count === 1 ? "" : "s"}`;

// The sticky bar at the bottom of the library while anything is selected,
// with the last run's results above it.
export function BulkBar({
  selected,
  role,
  running,
  run,
  onRun,
  onClear,
  onDismissRun,
}: {
  selected: ContentRow[];
  role: AdminRole;
  running: Running | null;
  run: BulkRun | null;
  onRun: (id: BulkActionId, extra?: RunExtra) => void;
  onClear: () => void;
  onDismissRun: () => void;
}) {
  const [dialog, setDialog] = useState<"schedule" | "edit" | null>(null);
  const total = selected.length;
  const counts = Object.fromEntries(
    order.map((id) => [id, selected.filter((row) => actionApplies(id, row.status, role)).length]),
  ) as Record<BulkActionId, number>;
  const visible = order.filter((id) => actionVisible(id, role));
  const live = running
    ? `${bulkAction(running.actionId).label.replace("…", "")}: ${running.done} of ${running.total} done`
    : run
      ? summaryText(run)
      : "";

  const button = (id: BulkActionId, onClick: () => void) => {
    const count = counts[id];
    const Icon = icons[id];
    const name = bulkAction(id).label.replace("…", "");
    return (
      <Button
        key={id}
        size="sm"
        variant={id === "publish" ? "default" : id === "delete" ? "destructive" : "outline"}
        disabled={!count || !!running}
        aria-label={count === total ? `${name} (${plural(count)})` : `${name} (${count} of ${total} selected)`}
        title={count ? undefined : `None of the selected items can be changed this way.`}
        onClick={onClick}
      >
        <Icon />
        {bulkAction(id).label}
        {count !== total && (
          <span className="rounded-full bg-background/30 px-1.5 text-[11px] tabular-nums">
            {count} of {total}
          </span>
        )}
      </Button>
    );
  };

  return (
    <div className={cn("sticky bottom-4 z-30 space-y-3", (total > 0 || running || run) && "mt-6")}>
      <p role="status" aria-live="polite" className="sr-only">{live}</p>
      {run && !running && <RunResults run={run} onDismiss={onDismissRun} />}
      {(total > 0 || running) && (
        <Card
          role="region"
          aria-label="Bulk actions"
          className="flex flex-col gap-3 border-primary/30 p-3 shadow-lg ring-1 ring-primary/10 lg:flex-row lg:items-center"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground tabular-nums">
              {total} selected
            </span>
            <Button size="sm" variant="ghost" onClick={onClear} disabled={!!running}>
              <X /> Clear
            </Button>
          </div>
          {running ? (
            <div className="flex flex-1 items-center gap-3" aria-hidden>
              <Progress
                value={running.total ? (running.done / running.total) * 100 : 0}
                className="flex-1"
                aria-label="Progress"
              />
              <span className="text-sm tabular-nums text-muted-foreground">
                {running.done} of {running.total}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              {visible.map((id) =>
                id === "delete" ? (
                  <ConfirmAction
                    key={id}
                    trigger={button(id, () => undefined)}
                    title={`Delete ${plural(counts.delete)} for ever?`}
                    destructive
                    confirmLabel={`Delete ${plural(counts.delete)}`}
                    typeToConfirm={String(counts.delete)}
                    description={
                      <>
                        <p>
                          This permanently removes the items and their files. It cannot be undone.
                        </p>
                        <p>
                          Only archived items and drafts that were never published can be deleted;
                          anything else is skipped and listed afterwards.
                          {counts.delete !== total && ` ${total - counts.delete} of the selected items are not archived or drafts and will be skipped.`}
                        </p>
                      </>
                    }
                    onConfirm={() => onRun("delete")}
                  />
                ) : (
                  button(id, () =>
                    id === "schedule" ? setDialog("schedule") : id === "edit" ? setDialog("edit") : onRun(id),
                  )
                ),
              )}
            </div>
          )}
        </Card>
      )}
      <ScheduleDialog
        open={dialog === "schedule"}
        count={counts.schedule}
        onClose={() => setDialog(null)}
        onSchedule={(scheduledAt) => {
          setDialog(null);
          onRun("schedule", { scheduledAt });
        }}
      />
      {dialog === "edit" && (
        <EditDetailsDialog
          count={counts.edit}
          onClose={() => setDialog(null)}
          onSave={(patch) => {
            setDialog(null);
            onRun("edit", { patch });
          }}
        />
      )}
    </div>
  );
}

function RunResults({ run, onDismiss }: { run: BulkRun; onDismiss: () => void }) {
  return (
    <Card className="gap-2 p-4 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{summaryText(run)}</p>
          {run.failed.length > 0 && (
            <p className="text-sm text-muted-foreground">
              The failed items are still selected: fix them, then try again.
            </p>
          )}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss results" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      {run.failed.length > 0 && (
        <ul aria-label="Failed items" className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {run.failed.map((item) => (
            <li key={item.id} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
              <a href={paths.contentEdit(item.id)} className="inline-flex items-center gap-1 font-medium hover:underline">
                {item.title} <ExternalLink className="size-3" aria-hidden />
              </a>
              <p className="text-muted-foreground">{item.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// datetime-local in the operator's timezone; must be in the future.
function ScheduleDialog({
  open,
  count,
  onClose,
  onSchedule,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onSchedule: (iso: string) => void;
}) {
  const [value, setValue] = useState("");
  // Checked when the time is picked (and again on Schedule).
  const [future, setFuture] = useState(false);
  const inFuture = (local: string) => {
    const time = local ? new Date(local).getTime() : NaN;
    return !Number.isNaN(time) && time > Date.now();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule {plural(count)}</DialogTitle>
          <DialogDescription>
            Ready items go live on their own at this time. Items that are not ready are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-schedule-at">Publish time (your local time)</Label>
          <Input
            id="bulk-schedule-at"
            type="datetime-local"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setFuture(inFuture(event.target.value));
            }}
            aria-invalid={!!value && !future}
          />
          {value && !future && <p className="text-sm text-destructive">Pick a time in the future.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!future}
            onClick={() => (inFuture(value) ? onSchedule(new Date(value).toISOString()) : setFuture(false))}
          >
            <CalendarClock /> Schedule {plural(count)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const modeLabels: Record<ListMode, string> = { add: "Add", remove: "Remove", replace: "Replace" };
const modeHints: Record<ListMode, string> = {
  add: "Added to what each item already has.",
  remove: "Taken off each item that has them.",
  replace: "Each item gets exactly these, replacing what it had.",
};

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={label}
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="px-3">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const triOptions: { value: Tri; label: string }[] = [
  { value: "leave", label: "Leave as is" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function EditDetailsDialog({
  count,
  onClose,
  onSave,
}: {
  count: number;
  onClose: () => void;
  onSave: (patch: BulkPatch) => void;
}) {
  const [form, setForm] = useState<DetailsForm>(emptyDetailsForm);
  const deities = useDeityPicker();
  const categories = useCategoryPicker();
  const tags = useTagPicker();
  const patch = patchFromForm(form);
  const changed = Object.keys(patch).length;
  const set = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const list = (
    key: "deityIds" | "categoryIds" | "tags",
    label: string,
    noun: string,
    picker: { options: { value: string; label: string; hint?: string }[]; create?: (input: { label: string; hindi: string }) => Promise<{ value: string; label: string; hint?: string }> },
  ) => (
    <section className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Choice
          label={`${label}: how to change`}
          value={form[key].mode}
          options={(Object.keys(modeLabels) as ListMode[]).map((mode) => ({ value: mode, label: modeLabels[mode] }))}
          onChange={(mode) => set(key, { ...form[key], mode })}
        />
      </div>
      <CreatableMultiSelect
        label={`${modeLabels[form[key].mode]} ${label.toLowerCase()}`}
        noun={noun}
        options={picker.options}
        value={form[key].values}
        onChange={(values) => set(key, { ...form[key], values })}
        onCreate={picker.create}
        askHindi={key !== "tags"}
        max={key === "tags" ? 40 : 10}
        hint={form[key].values.length ? modeHints[form[key].mode] : "Leave empty to keep them as they are."}
      />
    </section>
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit details of {plural(count)}</DialogTitle>
          <DialogDescription>
            Only what you change here is saved; everything else stays as it is on each item. Works on
            published items too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {list("deityIds", "Deities", "deity", deities)}
          {list("categoryIds", "Categories", "category", categories)}
          {list("tags", "Tags", "tag", tags)}
          <section className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            {(
              [
                ["isFeatured", "Featured"],
                ["isShareable", "Shareable"],
                ["adEligible", "Ad-eligible"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <p className="text-sm font-medium">{label}</p>
                <Choice label={label} value={form[key]} options={triOptions} onChange={(value) => set(key, value)} />
              </div>
            ))}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Save policy</p>
              <Choice
                label="Save policy"
                value={form.saveGate}
                options={[
                  { value: "leave", label: "Leave as is" },
                  { value: "FREE", label: "Free" },
                  { value: "REWARDED", label: "Rewarded (after an ad)" },
                ]}
                onChange={(value) => set("saveGate", value)}
              />
            </div>
          </section>
        </div>
        <DialogFooter className={cn("items-center gap-2", changed ? "" : "sm:justify-between")}>
          {!changed && <p className="text-sm text-muted-foreground">Nothing changed yet.</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!changed} onClick={() => onSave(patch)}>
              Save to {plural(count)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
