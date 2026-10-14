import { useId, useState } from "react";
import { Eye, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { cleanLyricsForDisplay, LYRICS_MAX_LENGTH, type Lyrics } from "../../domain";

const languages = [
  { key: "hi", label: "Hindi lyrics", tag: "हिन्दी", hint: "Devanagari, as in the audio file" },
  { key: "en", label: "Hinglish lyrics", tag: "Hinglish", hint: "Hindi in Roman letters" },
] as const;

function Count({ length }: { length: number }) {
  const over = length > LYRICS_MAX_LENGTH;
  return (
    <span className={cn("text-xs tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
      {length.toLocaleString("en-IN")} / {LYRICS_MAX_LENGTH.toLocaleString("en-IN")}
    </span>
  );
}

// Song lyrics in Hindi and Hinglish, with a preview of what the app shows
// (section notes such as "[Chorus — Mukhda]" are hidden there).
export function LyricsField({
  value,
  onChange,
  onFillHinglish,
  busy = false,
}: {
  value: Lyrics;
  onChange: (value: Lyrics) => void;
  onFillHinglish?: () => Promise<void>;
  busy?: boolean;
}) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = busy || filling;
  // Gemini writes the empty side from the filled one; nothing when both
  // (or neither) are filled.
  const hasHi = !!value.hi.trim();
  const hasEn = !!value.en.trim();
  const fillsFrom = hasHi && !hasEn ? "hi" : hasEn && !hasHi ? "en" : null;

  const fill = async () => {
    if (!onFillHinglish) return;
    setFilling(true);
    setError(null);
    try {
      await onFillHinglish();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFilling(false);
    }
  };

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Lyrics</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="mr-auto text-sm font-medium">
          Lyrics
        </span>
        {onFillHinglish && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working || !fillsFrom}
            title={
              fillsFrom
                ? undefined
                : value.hi.trim()
                  ? "Both languages are filled"
                  : "Add the Hindi (or Hinglish) lyrics first"
            }
            onClick={() => void fill()}
          >
            {filling ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {fillsFrom === "en" ? "Fill Hindi with Gemini" : "Fill Hinglish with Gemini"}
          </Button>
        )}
        <Toggle variant="outline" size="sm" pressed={preview} onPressedChange={setPreview}>
          <Eye />
          Preview
        </Toggle>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {languages.map(({ key, label, tag, hint }) => {
          const fieldId = `${id}-${key}`;
          const stanzas = preview ? cleanLyricsForDisplay(value[key]) : [];
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={preview ? undefined : fieldId}>
                  {label} <span className="font-normal text-muted-foreground">({tag})</span>
                </Label>
                <Count length={value[key].length} />
              </div>
              {preview ? (
                <div
                  role="region"
                  aria-label={`${label} preview`}
                  lang={key === "hi" ? "hi" : "en"}
                  className="max-h-[32rem] min-h-48 space-y-4 overflow-y-auto rounded-md border bg-muted/40 px-4 py-3 text-base leading-relaxed"
                >
                  {stanzas.length ? (
                    stanzas.map((lines, index) => (
                      <p key={index}>
                        {lines.map((line, lineIndex) => (
                          <span key={lineIndex} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No lyrics to show.</p>
                  )}
                </div>
              ) : (
                <Textarea
                  id={fieldId}
                  lang={key === "hi" ? "hi" : "en"}
                  value={value[key]}
                  maxLength={LYRICS_MAX_LENGTH}
                  disabled={filling && key !== fillsFrom}
                  placeholder={hint}
                  onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                  className="min-h-64 font-normal leading-relaxed [field-sizing:fixed]"
                />
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">Could not fill the lyrics: {error}</p>}
    </fieldset>
  );
}
