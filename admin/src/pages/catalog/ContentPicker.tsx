import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdmin } from "../../app/context";
import type { ContentRow } from "../../api";

// Ordered content items for a collection: search published content, add,
// reorder, remove.
export function ContentPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const { api } = useAdmin();
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .listContent({ status: "PUBLISHED", pageSize: 99 })
      .then((page) => active && setRows(page.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const move = (index: number, delta: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Items ({value.length})</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus /> Add content
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search published content…" />
              <CommandList>
                <CommandEmpty>No published content matches.</CommandEmpty>
                <CommandGroup>
                  {rows
                    .filter((row) => !value.includes(row.id))
                    .map((row) => (
                      <CommandItem
                        key={row.id}
                        value={`${row.title.en} ${row.title.hi} ${row.id}`}
                        onSelect={() => {
                          onChange([...value, row.id]);
                          setOpen(false);
                        }}
                      >
                        <span className="truncate">{row.title.en || row.id}</span>
                        <Badge variant="secondary" className="ml-auto">{(row.type ?? "untyped").toLowerCase()}</Badge>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No items yet.</p>
      ) : (
        <ol className="divide-y rounded-xl border">
          {value.map((id, index) => {
            const row = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{row?.title.en || id}</span>
                {row && <Badge variant="outline">{(row.type ?? "untyped").toLowerCase()}</Badge>}
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Move down" disabled={index === value.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove ${row?.title.en ?? id}`} onClick={() => onChange(value.filter((item) => item !== id))}>
                  <X />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
