import { ReactNode, useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiOption = {
  value: string;
  label: string;
  // Second-language name (usually Hindi), shown next to the label.
  hint?: string;
};

// What the "Create" step collects. `hindi` is only asked for with askHindi.
export type CreateInput = { label: string; hindi: string };

type Props = {
  label: string;
  options: readonly MultiOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  // Omit to hide "Create …" (e.g. the role cannot add catalogue items).
  // Throw to show a message in the picker.
  onCreate?: (input: CreateInput) => Promise<MultiOption>;
  // Ask for an optional Hindi name before creating.
  askHindi?: boolean;
  // Singular noun for buttons and messages, e.g. "deity".
  noun?: string;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  max?: number;
};

const devanagari = /[ऀ-ॿ]/;
const norm = (text: string) => text.trim().toLocaleLowerCase();

// Searchable multi-select (Popover + Command) with removable chips. Typing a
// value that does not exist offers "Create “…”" as the last option.
export function CreatableMultiSelect({
  label,
  options,
  value,
  onChange,
  onCreate,
  askHindi = false,
  noun = "item",
  hint,
  error,
  disabled,
  max,
}: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<CreateInput | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Options created here, until the caller's list includes them.
  const [created, setCreated] = useState<MultiOption[]>([]);

  const all = useMemo(() => {
    const known = new Set(options.map((option) => option.value));
    return [...options, ...created.filter((option) => !known.has(option.value))];
  }, [options, created]);
  const byValue = useMemo(() => new Map(all.map((option) => [option.value, option])), [all]);
  const full = max !== undefined && value.length >= max;

  const q = norm(query);
  const matches = all.filter(
    (option) =>
      !q ||
      norm(option.label).includes(q) ||
      norm(option.value).includes(q) ||
      (option.hint ? norm(option.hint).includes(q) : false),
  );
  const exact = all.some(
    (option) => norm(option.label) === q || norm(option.value) === q || (option.hint && norm(option.hint) === q),
  );
  const canCreate = !!onCreate && q !== "" && !exact && !full;

  const reset = () => {
    setQuery("");
    setPending(null);
    setCreateError(null);
  };
  const toggle = (item: string) => {
    if (value.includes(item)) onChange(value.filter((v) => v !== item));
    else if (!full) onChange([...value, item]);
  };

  const create = async (input: CreateInput) => {
    if (!onCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const option = await onCreate({ label: input.label.trim(), hindi: input.hindi.trim() });
      setCreated((current) => [...current.filter((o) => o.value !== option.value), option]);
      if (!value.includes(option.value)) onChange([...value, option.value]);
      reset();
      setOpen(false);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  };
  const startCreate = () => {
    const typed = query.trim();
    if (!askHindi) return void create({ label: typed, hindi: "" });
    // Typed in Devanagari: that is the Hindi name; ask for the English one.
    setPending(devanagari.test(typed) ? { label: "", hindi: typed } : { label: typed, hindi: "" });
    setCreateError(null);
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field space-y-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="field-label text-sm font-medium">
        {label}
      </span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Selected ${label.toLowerCase()}`}>
          {value.map((item) => {
            const option = byValue.get(item);
            const text = option?.label ?? item;
            return (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary py-1 pr-1 pl-3 text-sm text-secondary-foreground"
              >
                <span>{text}</span>
                {option?.hint && option.hint !== text && (
                  <span lang="hi" className="text-muted-foreground">
                    {option.hint}
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-full p-1 hover:bg-background disabled:opacity-50"
                  aria-label={`Remove ${text}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v !== item))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${labelId} ${id}-trigger`}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span id={`${id}-trigger`} className="text-muted-foreground">
              {onCreate ? `Choose or add ${noun}` : `Choose ${noun}`}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          {pending ? (
            <div className="space-y-3 p-3" role="group" aria-label={`New ${noun}`}>
              <p className="text-sm font-medium">New {noun}</p>
              <div className="space-y-1">
                <Label htmlFor={`${id}-new-en`}>Name in English</Label>
                <Input
                  id={`${id}-new-en`}
                  value={pending.label}
                  autoFocus={!pending.label}
                  onChange={(event) => setPending({ ...pending, label: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-new-hi`}>Name in Hindi (optional)</Label>
                <Input
                  id={`${id}-new-hi`}
                  lang="hi"
                  value={pending.hindi}
                  autoFocus={!!pending.label}
                  onChange={(event) => setPending({ ...pending, hindi: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && pending.label.trim()) {
                      event.preventDefault();
                      void create(pending);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Leave empty to add it later.</p>
              </div>
              {createError && (
                <p role="alert" className="field-error text-sm">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} disabled={creating}>
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={creating || !pending.label.trim()}
                  onClick={() => void create(pending)}
                >
                  {creating ? "Creating…" : `Create ${noun}`}
                </Button>
              </div>
            </div>
          ) : (
            <Command shouldFilter={false} label={`Search ${label.toLowerCase()}`}>
              <CommandInput
                placeholder={onCreate ? `Search or type a new ${noun}…` : `Search…`}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {!canCreate && <CommandEmpty>Nothing found.</CommandEmpty>}
                <CommandGroup>
                  {matches.map((option) => {
                    const selected = value.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={`option:${option.value}`}
                        disabled={!selected && full}
                        onSelect={() => toggle(option.value)}
                      >
                        <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{option.label}</span>
                        {option.hint && option.hint !== option.label && (
                          <span lang="hi" className="ml-auto truncate text-muted-foreground">
                            {option.hint}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                  {canCreate && (
                    <CommandItem value={`create:${q}`} disabled={creating} onSelect={startCreate}>
                      <Plus className="size-4" />
                      <span className="truncate">
                        {creating ? "Creating…" : `Create “${query.trim()}”`}
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
              {createError && (
                <p role="alert" className="field-error border-t p-2 text-sm">
                  {createError}
                </p>
              )}
              {full && <p className="border-t p-2 text-xs text-muted-foreground">At most {max} can be chosen.</p>}
            </Command>
          )}
        </PopoverContent>
      </Popover>
      {hint && (
        <p className="hint text-xs text-muted-foreground" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
