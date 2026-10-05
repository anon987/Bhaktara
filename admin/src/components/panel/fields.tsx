import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Localized = { hi: string; en: string };

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// Hindi first, then English (the app is Hindi-first).
export function LocalizedInput({
  id,
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
  error,
  required = false,
}: {
  id: string;
  label: string;
  value: Localized;
  onChange: (value: Localized) => void;
  multiline?: boolean;
  maxLength?: number;
  error?: string;
  required?: boolean;
}) {
  const Control = multiline ? Textarea : Input;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["hi", "en"] as const).map((lang) => (
          <div key={lang} className="relative">
            <span className="pointer-events-none absolute right-2.5 top-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {lang === "hi" ? "हिन्दी" : "EN"}
            </span>
            <Control
              id={`${id}-${lang}`}
              aria-label={`${label} (${lang === "hi" ? "Hindi" : "English"})`}
              lang={lang}
              value={value[lang]}
              maxLength={maxLength}
              onChange={(event) => onChange({ ...value, [lang]: event.target.value })}
              className={cn(multiline && "min-h-24", "pr-14")}
            />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

export const emptyLocalized = (): Localized => ({ hi: "", en: "" });
export const localizedOf = (value: unknown): Localized => {
  const record = (value ?? {}) as Partial<Localized>;
  return { hi: record.hi ?? "", en: record.en ?? "" };
};
