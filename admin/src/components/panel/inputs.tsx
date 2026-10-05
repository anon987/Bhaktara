import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAdmin } from "../../app/context";

export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value === "" ? NaN : Number(event.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: T | "";
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder ?? "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// datetime-local in the operator's timezone ⇄ ISO instant.
export const isoToLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
export const localToIso = (value: string) => (value ? new Date(value).toISOString() : "");

export function DateTimeField({
  id,
  label,
  value,
  onChange,
  type = "datetime-local",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "datetime-local" | "date";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={type === "date" ? value : isoToLocal(value)}
        onChange={(event) =>
          onChange(type === "date" ? event.target.value : localToIso(event.target.value))
        }
      />
    </div>
  );
}

// Toggle chips for a small multi-choice set.
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? value.filter((item) => item !== option.value) : [...value, option.value])
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {on && <Check className="size-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

// Deities from the catalogue (all, including inactive ones) as chips.
export function useDeityOptions() {
  const { panel } = useAdmin();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let active = true;
    panel
      .listCatalog<{ name?: { en?: string; hi?: string }; sortOrder?: number }>("deity")
      .then((rows) => {
        if (!active) return;
        setOptions(
          rows
            .sort((a, b) => (a.data.sortOrder ?? 0) - (b.data.sortOrder ?? 0))
            .map((row) => ({ value: row.id, label: row.data.name?.en ?? row.id })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [panel]);
  return options;
}
