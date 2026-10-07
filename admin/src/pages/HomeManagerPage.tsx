import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { HomeLayoutSectionInput } from "../../../src/domain/home";
import { useAdmin } from "../app/context";
import { can, contentTypes } from "../domain";
import { LocalizedInput, localizedOf } from "../components/panel/fields";
import { ago } from "../components/panel/format";
import { NumberField, SelectField } from "../components/panel/inputs";
import { ErrorState, LoadingState, PageHeader } from "../components/panel/page";
import { useAction } from "../components/panel/useAction";
import type { HomeLanguage, HomeLayoutState } from "../panelApi";

type Section = HomeLayoutSectionInput;
const addable: { type: Section["type"]; label: string }[] = [
  { type: "RAIL", label: "Content rail" },
  { type: "SADHANA", label: "Today's Sadhana" },
  { type: "PROGRESS", label: "Progress (XP, streak)" },
  { type: "SHORTCUTS", label: "Shortcuts" },
  { type: "QUOTE", label: "Quote" },
  { type: "CHALLENGES", label: "Challenges" },
  { type: "FESTIVALS", label: "Festivals" },
];
const typeLabel = (type: string) => addable.find((a) => a.type === type)?.label ?? (type === "BANNERS" ? "Banners (fixed first)" : type);

function newSection(type: Section["type"], index: number): Section {
  const id = `${type.toLowerCase()}-${Date.now().toString(36)}`;
  const base = { id, order: index * 10, visible: true };
  if (type === "RAIL") return { ...base, type, title: { hi: "", en: "" }, source: { sort: "POPULAR" }, limit: 10 };
  if (type === "QUOTE") return { ...base, type, text: { hi: "", en: "" } };
  if (type === "SHORTCUTS") return { ...base, type, items: [] };
  return { ...base, type } as Section;
}

function SectionEditor({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  if (section.type === "RAIL") {
    const source = section.source ?? {};
    return (
      <div className="space-y-4">
        <LocalizedInput id={`${section.id}-title`} label="Title" value={localizedOf(section.title)} onChange={(title) => onChange({ ...section, title })} maxLength={80} required />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${section.id}-collection`}>Collection (optional)</Label>
            <Input id={`${section.id}-collection`} value={source.collectionId ?? ""} placeholder="collection id" onChange={(e) => onChange({ ...section, source: { ...source, collectionId: e.target.value.trim() || undefined } })} />
          </div>
          <SelectField id={`${section.id}-type`} label="Content type" value={source.contentType ?? "ANY"} options={[{ value: "ANY", label: "Any type" }, ...contentTypes.map((t) => ({ value: t, label: t.toLowerCase() }))]} onChange={(value) => onChange({ ...section, source: { ...source, contentType: value === "ANY" ? undefined : (value as typeof source.contentType) } })} />
          <SelectField id={`${section.id}-sort`} label="Order" value={source.sort ?? "POPULAR"} options={[{ value: "POPULAR", label: "Most popular" }, { value: "NEW", label: "Newest" }]} onChange={(sort) => onChange({ ...section, source: { ...source, sort } })} />
        </div>
        <NumberField id={`${section.id}-limit`} label="Cards" value={section.limit ?? 10} min={1} max={20} onChange={(limit) => onChange({ ...section, limit })} />
      </div>
    );
  }
  if (section.type === "QUOTE")
    return (
      <div className="space-y-4">
        <LocalizedInput id={`${section.id}-text`} label="Quote" multiline value={localizedOf(section.text)} onChange={(text) => onChange({ ...section, text })} maxLength={300} required />
        <LocalizedInput id={`${section.id}-by`} label="Attribution" value={localizedOf(section.attribution)} onChange={(attribution) => onChange({ ...section, attribution })} maxLength={120} />
      </div>
    );
  if (section.type === "SHORTCUTS")
    return (
      <div className="space-y-3">
        {(section.items ?? []).map((item, i) => (
          <div key={i} className="flex items-end gap-2 rounded-xl border p-3">
            <div className="flex-1 space-y-3">
              <LocalizedInput id={`${section.id}-s${i}`} label={`Shortcut ${i + 1}`} value={localizedOf(item.label)} onChange={(label) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, label } : it)) })} maxLength={30} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField id={`${section.id}-route${i}`} label="Opens" value={item.target.route} options={[{ value: "explore", label: "Explore" }, { value: "mandir", label: "Mandir" }, { value: "sadhana", label: "Sadhana" }]} onChange={(route) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, target: { route } as typeof it.target } : it)) })} />
                <div className="space-y-2">
                  <Label htmlFor={`${section.id}-icon${i}`}>Icon key</Label>
                  <Input id={`${section.id}-icon${i}`} value={item.iconKey} onChange={(e) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, iconKey: e.target.value.trim() } : it)) })} />
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label="Remove shortcut" onClick={() => onChange({ ...section, items: section.items.filter((_, j) => j !== i) })}><Trash2 /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => onChange({ ...section, items: [...(section.items ?? []), { label: { hi: "", en: "" }, iconKey: "lotus", target: { route: "mandir" } }] })}>
          <Plus /> Add shortcut
        </Button>
      </div>
    );
  return (
    <LocalizedInput id={`${section.id}-title`} label="Title (optional)" value={localizedOf(section.title)} onChange={(title) => onChange({ ...section, title: title.hi || title.en ? title : undefined } as Section)} maxLength={80} />
  );
}

function PhonePreview({ sections, language }: { sections: Section[]; language: HomeLanguage }) {
  const shown = sections.filter((s) => s.visible);
  return (
    <div className="mx-auto w-[260px] rounded-[2.2rem] border-8 border-foreground/85 bg-background p-3 shadow-xl">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-foreground/20" />
      <div className="space-y-2">
        <div className="h-20 rounded-2xl bg-gradient-to-br from-primary/70 to-kumkum/60" title="Banners" />
        {shown.filter((s) => s.type !== "BANNERS").map((s) => {
          const title = "title" in s && s.title ? (s.title as { hi: string; en: string })[language] : "";
          return (
            <div key={s.id} className="rounded-xl border bg-card p-2">
              <p className="truncate text-[11px] font-semibold">{title || typeLabel(s.type)}</p>
              {s.type === "RAIL" ? (
                <div className="mt-1.5 flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-12 w-14 rounded-lg bg-accent" />)}</div>
              ) : s.type === "SHORTCUTS" ? (
                <div className="mt-1.5 flex gap-1.5">{(s.items ?? []).slice(0, 4).map((_, i) => <div key={i} className="size-8 rounded-full bg-secondary" />)}</div>
              ) : (
                <div className="mt-1.5 h-6 rounded-md bg-muted" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HomeManagerPage() {
  const { panel, role } = useAdmin();
  const writable = can(role, "home.write");
  const [language, setLanguage] = useState<HomeLanguage>("hi");
  const [state, setState] = useState<HomeLayoutState | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    panel
      .getHomeLayout(language)
      .then((layout) => {
        if (!active) return;
        setState(layout);
        setSections([...layout.sections].sort((a, b) => a.order - b.order));
        setError(null);
      })
      .catch((caught: Error) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [panel, language, reload]);

  const save = useAction(
    async () => {
      if (!state) return;
      const ordered = sections.map((s, i) => ({ ...s, order: i * 10 }));
      await panel.updateHomeLayout({ language, sections: ordered, expectedRevision: state.revision });
      setReload((n) => n + 1);
    },
    { success: "Layout saved; the Home feed is rebuilding" },
  );
  const rebuild = useAction(() => panel.rebuildHomeFeed(), { success: "Home feeds rebuilt" });
  const move = (index: number, delta: number) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setSections(next);
  };
  const update = useCallback((index: number, section: Section) => setSections((list) => list.map((s, i) => (i === index ? section : s))), []);

  return (
    <div>
      <PageHeader
        title="Home manager"
        description="Order, show and edit the sections of the Home screen for each language. Banners always come first (D-030)."
        actions={
          <>
            {writable && <Button variant="outline" onClick={() => void rebuild.run()} disabled={rebuild.busy}><RefreshCw className={cn(rebuild.busy && "animate-spin")} /> Rebuild feeds</Button>}
            {writable && <Button onClick={() => void save.run()} disabled={save.busy || !state}><Save /> {save.busy ? "Saving…" : "Save layout"}</Button>}
          </>
        }
      />
      <Tabs value={language} onValueChange={(value) => setLanguage(value as HomeLanguage)} className="mb-4">
        <TabsList>
          <TabsTrigger value="hi">हिन्दी Home</TabsTrigger>
          <TabsTrigger value="en">English Home</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && <ErrorState error={{ kind: "unknown", title: "Could not load the layout", message: error.message, problems: [] }} onRetry={() => setReload((n) => n + 1)} />}
      {save.error && <div className="mb-4"><ErrorState error={save.error} /></div>}
      {!state && !error && <LoadingState rows={6} />}
      {state && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Revision {state.revision}</Badge>
              <span>Feed built {ago(state.builder.builtAt)}</span>
              {state.builder.dirty && <Badge variant="secondary">rebuild pending</Badge>}
            </div>
            {sections.map((section, index) => (
              <Collapsible key={section.id}>
                <Card className="gap-0 py-0">
                  <div className="flex items-center gap-2 p-3">
                    <div className="flex flex-col">
                      <Button variant="ghost" size="icon" className="size-6" aria-label="Move up" disabled={!writable || index === 0 || section.type === "BANNERS"} onClick={() => move(index, -1)}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon" className="size-6" aria-label="Move down" disabled={!writable || index === sections.length - 1 || section.type === "BANNERS"} onClick={() => move(index, 1)}><ArrowDown /></Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{"title" in section && section.title ? localizedOf(section.title)[language] || typeLabel(section.type) : typeLabel(section.type)}</p>
                      <p className="text-xs text-muted-foreground">{typeLabel(section.type)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {section.visible ? <Eye className="size-4 text-muted-foreground" /> : <EyeOff className="size-4 text-muted-foreground" />}
                      <Switch aria-label="Visible" checked={section.visible} disabled={!writable} onCheckedChange={(visible) => update(index, { ...section, visible })} />
                    </div>
                    {section.type !== "BANNERS" && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Edit section"><ChevronDown /></Button>
                      </CollapsibleTrigger>
                    )}
                    {writable && section.type !== "BANNERS" && (
                      <Button variant="ghost" size="icon" aria-label="Remove section" onClick={() => setSections((list) => list.filter((_, i) => i !== index))}><Trash2 /></Button>
                    )}
                  </div>
                  <CollapsibleContent className="border-t p-4">
                    <fieldset disabled={!writable}>
                      <SectionEditor section={section} onChange={(next) => update(index, next)} />
                    </fieldset>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
            {writable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline"><Plus /> Add section</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {addable.map((entry) => (
                    <DropdownMenuItem key={entry.type} onClick={() => setSections((list) => [...list, newSection(entry.type, list.length)])}>
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!state.valid && state.issues.length > 0 && (
              <Card className="border-destructive/40">
                <CardHeader><CardTitle className="text-base text-destructive">The stored layout has problems</CardTitle></CardHeader>
                <CardContent className="text-sm">{state.issues.map((issue) => <p key={issue.path}>{issue.path}: {issue.message}</p>)}</CardContent>
              </Card>
            )}
          </div>
          <div className="lg:sticky lg:top-20 lg:h-fit">
            <p className="mb-3 text-center text-sm text-muted-foreground">Preview</p>
            <PhonePreview sections={sections} language={language} />
          </div>
        </div>
      )}
    </div>
  );
}
