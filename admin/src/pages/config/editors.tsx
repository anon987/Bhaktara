import { useMemo, type ReactNode } from "react";
import { Ban } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  defaultGamificationConfig,
  defaultSadhanaConfig,
  rankNames,
  xpForLevel,
  type GamificationConfig,
  type SadhanaConfig,
} from "../../../../src/domain/progression";
import {
  bhogKinds,
  bhogNames,
  flowerKinds,
  flowerNames,
  forbiddenFlowers,
  garlandKinds,
  garlandNames,
  offeringsFor,
  trayItems,
  trayLabels,
  trayNames,
  type DeityOfferings,
} from "../../../../src/domain/puja";
import {
  emptyVisualsConfig,
  type SceneSlot,
  type VisualArt,
  type VisualsConfig,
} from "../../../../src/domain/visuals";
import { AssetPicker } from "../../components/panel/media";
import type { AssetPurpose, PujaConfig } from "../../../../src/domain/admin";
import { LocalizedInput, localizedOf } from "../../components/panel/fields";
import { NumberField, SelectField, SwitchField, useDeityOptions } from "../../components/panel/inputs";
import type { ConfigId } from "../../panelApi";

type Editor = {
  title: string;
  description: string;
  defaults: () => unknown;
  normalize: (data: unknown) => unknown;
  Editor: (props: { value: never; onChange: (value: unknown) => void }) => ReactNode;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---- XP & levels ---------------------------------------------------------------

const curveConfig = { xp: { label: "XP to reach level", color: "var(--chart-1)" } } satisfies ChartConfig;

function GamificationEditor({ value: c, onChange }: { value: GamificationConfig; onChange: (value: GamificationConfig) => void }) {
  const set = <K extends keyof GamificationConfig>(key: K, patch: Partial<GamificationConfig[K]>) =>
    onChange({ ...c, [key]: { ...(c[key] as object), ...patch } });
  const curve = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({ level: i + 1, xp: xpForLevel(i + 1, c) })),
    [c],
  );
  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <>
      <Section title="XP for each practice" description="Direct XP comes only from practice and challenges (doc 10 §2).">
        <div className={grid}>
          <NumberField id="xp-task" label="Sadhana task" value={c.xp.task} min={0} onChange={(task) => set("xp", { task })} />
          <NumberField id="xp-full" label="Full Sadhana bonus" value={c.xp.fullSadhanaBonus} min={0} onChange={(fullSadhanaBonus) => set("xp", { fullSadhanaBonus })} />
          <NumberField id="xp-mala" label="One mala" value={c.xp.mala} min={0} onChange={(mala) => set("xp", { mala })} />
          <NumberField id="xp-meditation" label="Meditation session" value={c.xp.meditationSession} min={0} onChange={(meditationSession) => set("xp", { meditationSession })} />
          <NumberField id="xp-mandir" label="Mandir visit" value={c.xp.mandirVisit} min={0} onChange={(mandirVisit) => set("xp", { mandirVisit })} />
        </div>
      </Section>
      <Section title="Limits" description="The daily cap must be at least the largest single award.">
        <div className={grid}>
          <NumberField id="cap" label="Daily XP cap" value={c.limits.dailyXpCap} min={1} onChange={(dailyXpCap) => set("limits", { dailyXpCap })} />
          <NumberField id="malas-day" label="Rewarded malas per day" value={c.limits.malasPerDay} min={0} onChange={(malasPerDay) => set("limits", { malasPerDay })} />
          <NumberField id="med-day" label="Rewarded meditations per day" value={c.limits.meditationSessionsPerDay} min={0} onChange={(meditationSessionsPerDay) => set("limits", { meditationSessionsPerDay })} />
          <NumberField id="med-min" label="Meditation minimum (min)" value={c.limits.meditationSessionMinMinutes} min={1} onChange={(meditationSessionMinMinutes) => set("limits", { meditationSessionMinMinutes })} />
          <NumberField id="starts" label="Session starts per day" value={c.limits.sessionStartsPerDay} min={1} onChange={(sessionStartsPerDay) => set("limits", { sessionStartsPerDay })} />
        </div>
      </Section>
      <Section title="Sessions and fair play" description="Server-timed checks (doc 10 §9).">
        <div className={grid}>
          <NumberField id="sec-mala" label="Seconds per mala (min)" value={c.session.minSecondsPerMala} min={1} onChange={(minSecondsPerMala) => set("session", { minSecondsPerMala })} />
          <NumberField id="max-malas" label="Malas per session (max)" value={c.session.maxMalasPerSession} min={1} onChange={(maxMalasPerSession) => set("session", { maxMalasPerSession })} />
          <NumberField id="max-med" label="Meditation minutes (max)" value={c.session.maxMeditationMinutes} min={1} onChange={(maxMeditationMinutes) => set("session", { maxMeditationMinutes })} />
          <NumberField id="open-hours" label="Session open hours (max)" value={c.session.maxOpenHours} min={1} onChange={(maxOpenHours) => set("session", { maxOpenHours })} />
          <NumberField id="grace" label="Clock grace (seconds)" value={c.session.graceSeconds} min={0} onChange={(graceSeconds) => set("session", { graceSeconds })} />
          <NumberField id="sus" label="Flag above malas per hour" value={c.suspicious.malasPerHour} min={1} onChange={(malasPerHour) => set("suspicious", { malasPerHour })} />
        </div>
      </Section>
      <Section title="Levels and ranks" description="XP to reach level n = base × (n − 1)^exponent. Ranks begin at the levels below.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="base" label="Base" value={c.levelCurve.base} min={1} step={1} onChange={(base) => set("levelCurve", { base })} />
              <NumberField id="exponent" label="Exponent" value={c.levelCurve.exponent} min={1} step={0.05} onChange={(exponent) => set("levelCurve", { exponent })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.rankLevels.map((entry, index) => (
                <NumberField
                  key={entry.rank}
                  id={`rank-${entry.rank}`}
                  label={`${rankNames[entry.rank].en} (${rankNames[entry.rank].hi}) from level`}
                  value={entry.minLevel}
                  min={1}
                  onChange={(minLevel) =>
                    onChange({ ...c, rankLevels: c.rankLevels.map((r, i) => (i === index ? { ...r, minLevel } : r)) })
                  }
                />
              ))}
            </div>
          </div>
          <ChartContainer config={curveConfig} className="h-64 w-full">
            <LineChart data={curve} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="level" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => `Level ${payload?.[0]?.payload?.level}`} />} />
              <Line dataKey="xp" stroke="var(--color-xp)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </Section>
    </>
  );
}

// ---- Sadhana plan ------------------------------------------------------------------

function SadhanaEditor({ value: c, onChange }: { value: SadhanaConfig; onChange: (value: SadhanaConfig) => void }) {
  return (
    <>
      <Section title="Daily plan" description="What completes each Sadhana task.">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="jaap-target" label="Jaap: malas for the task" value={c.jaapTargetMalas} min={1} onChange={(jaapTargetMalas) => onChange({ ...c, jaapTargetMalas })} />
          <NumberField id="med-target" label="Meditation: minutes for the task" value={c.meditationTargetMinutes} min={1} onChange={(meditationTargetMinutes) => onChange({ ...c, meditationTargetMinutes })} />
        </div>
      </Section>
      <Section title="Puja tray" description="The offerings on the prayer tray, in traditional order (D-054). Required ones record the day's prayer.">
        <div className="space-y-4">
          {c.prayerItems.map((item, index) => {
            const update = (patch: Partial<typeof item>) =>
              onChange({ ...c, prayerItems: c.prayerItems.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
            return (
              <div key={item.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{index + 1}. {trayNames[item.kind]?.en ?? item.kind}</p>
                  <SwitchField id={`req-${item.id}`} label="Required" checked={item.required} onChange={(required) => update({ required })} />
                </div>
                <LocalizedInput id={`label-${item.id}`} label="Name (read aloud by screen readers)" value={item.label} onChange={(label) => update({ label })} maxLength={80} />
                <LocalizedInput id={`line-${item.id}`} label="Sanskrit line (optional)" value={item.line ?? { hi: "", en: "" }} onChange={(line) => update({ line: line.hi || line.en ? line : undefined })} maxLength={200} />
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ---- Puja offerings per deity ---------------------------------------------------

function OfferingsEditor({
  deityId,
  value: o,
  onChange,
}: {
  deityId: string | null;
  value: DeityOfferings;
  onChange: (value: DeityOfferings) => void;
}) {
  const banned = (deityId && forbiddenFlowers[deityId]) || [];
  const toggle = <T extends string>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Flowers in the drawer</legend>
        <div className="flex flex-wrap gap-2">
          {flowerKinds.map((flower) => {
            const forbidden = banned.includes(flower);
            const on = o.flowers.includes(flower);
            return (
              <button
                key={flower}
                type="button"
                disabled={forbidden}
                aria-pressed={on}
                title={forbidden ? "Never offered to this deity" : undefined}
                onClick={() => onChange({ ...o, flowers: toggle(o.flowers, flower) })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  forbidden ? "cursor-not-allowed border-destructive/30 text-destructive/60 line-through" : on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {forbidden && <Ban className="size-3.5" />}
                {flowerNames[flower].en} · {flowerNames[flower].hi}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Bhog in the drawer</legend>
        <div className="flex flex-wrap gap-2">
          {bhogKinds.map((bhog) => {
            const on = o.bhog.includes(bhog);
            return (
              <button
                key={bhog}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...o, bhog: toggle(o.bhog, bhog) })}
                className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {bhogNames[bhog].en} · {bhogNames[bhog].hi}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id={`garland-${deityId}`} label="Garland" value={o.garland} options={garlandKinds.map((g) => ({ value: g, label: garlandNames[g].en }))} onChange={(garland) => onChange({ ...o, garland })} />
        <SelectField id={`tilak-${deityId}`} label="Tilak" value={o.tilak} options={[{ value: "tripundra", label: "Tripundra (three lines)" }, { value: "urdhvaPundra", label: "Urdhva pundra (U mark)" }, { value: "bindu", label: "Bindu (kumkum dot)" }]} onChange={(tilak) => onChange({ ...o, tilak })} />
      </div>
      <SwitchField id={`tulsi-${deityId}`} label="Tulsi leaf on the bhog" description="For Vishnu, Krishna and Ram" checked={o.tulsiOnBhog} onChange={(tulsiOnBhog) => onChange({ ...o, tulsiOnBhog })} />
    </div>
  );
}

function PujaEditor({ value: c, onChange }: { value: PujaConfig; onChange: (value: PujaConfig) => void }) {
  const deities = useDeityOptions();
  const ids = Array.from(new Set([...deities.map((d) => d.value), ...Object.keys(c.deities)]));
  const name = (id: string) => deities.find((d) => d.value === id)?.label ?? id.charAt(0).toUpperCase() + id.slice(1);
  return (
    <Section title="Offerings for each deity" description="Only what suits the deity appears in the app's drawers. Forbidden offerings cannot be chosen (ketaki or tulsi for Shiva, tulsi for Ganesha, durva for the Devi).">
      <Tabs defaultValue="general">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="general">All others</TabsTrigger>
          {ids.map((id) => (
            <TabsTrigger key={id} value={id}>{name(id)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general" className="pt-4">
          <OfferingsEditor deityId={null} value={c.general} onChange={(general) => onChange({ ...c, general })} />
        </TabsContent>
        {ids.map((id) => (
          <TabsContent key={id} value={id} className="pt-4">
            <OfferingsEditor
              deityId={id}
              value={c.deities[id] ?? offeringsFor(id)}
              onChange={(offerings) => onChange({ ...c, deities: { ...c.deities, [id]: offerings } })}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Section>
  );
}

const pujaDefaults = (): PujaConfig => ({
  version: 1,
  general: offeringsFor(null),
  deities: Object.fromEntries(
    ["shiva", "ganesha", "krishna", "vishnu", "ram", "lakshmi", "durga", "hanuman", "saraswati"].map((id) => [id, offeringsFor(id)]),
  ),
});

// ---- Prayer & Jaap visuals (D-057) ------------------------------------------------

type Slot = { id: string; label: string; hint?: string; purpose?: AssetPurpose };

// A grid of image slots for one group of the config; an empty slot keeps the
// app's own drawing.
function SlotGrid({
  slots,
  purpose,
  value,
  onChange,
}: {
  slots: Slot[];
  purpose: AssetPurpose;
  value: Partial<Record<string, VisualArt>>;
  onChange: (value: Partial<Record<string, VisualArt>>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {slots.map((slot) => (
        <div key={slot.id} className="space-y-2 rounded-xl border p-3">
          <div>
            <p className="font-medium">{slot.label}</p>
            {slot.hint && <p className="text-xs text-muted-foreground">{slot.hint}</p>}
          </div>
          <AssetPicker
            purpose={slot.purpose ?? purpose}
            label="Image"
            value={value[slot.id] ?? null}
            onChange={(art) => {
              const next = { ...value };
              if (art) next[slot.id] = art;
              else delete next[slot.id];
              onChange(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

const sceneSlots: (Slot & { id: SceneSlot; purpose: AssetPurpose })[] = [
  { id: "prayerBackground", purpose: "background", label: "Prayer background", hint: "Full-screen parchment behind the temple. Portrait 1080 × 2400; keep the middle calm, decoration at the edges." },
  { id: "jaapBackground", purpose: "background", label: "Jaap background", hint: "Full-screen ground behind the mala. Portrait 1080 × 2400." },
  { id: "meditationBackground", purpose: "background", label: "Meditation background", hint: "Full-screen ground behind the lamp. Portrait 1080 × 2400." },
  { id: "meditationLamp", purpose: "decor", label: "Meditation lamp", hint: "The diya in the circle (a brass lamp, flame lit). Transparent PNG, square, about 800 × 800; the app adds the breathing glow." },
  { id: "toran", purpose: "decor", label: "Toran (top garland)", hint: "Marigold garland across the top of both screens. Transparent PNG, wide, about 1080 × 240." },
  { id: "divider", purpose: "decor", label: "Divider", hint: "The small ornament under headings. Transparent PNG, about 520 × 44." },
];

function VisualsEditor({ value: c, onChange }: { value: VisualsConfig; onChange: (value: VisualsConfig) => void }) {
  const tile = "Transparent PNG, square, at least 512 × 512.";
  return (
    <>
      <Section title="Backgrounds and decoration" description="What the Prayer, Jaap and Meditation screens are drawn on. Leave a slot empty to keep the app's own drawing.">
        <SlotGrid
          slots={sceneSlots}
          purpose="decor"
          value={c.scenes}
          onChange={(scenes) => onChange({ ...c, scenes })}
        />
      </Section>
      <Section title="Offering tray" description={`The eight tiles under "Choose an offering". ${tile}`}>
        <SlotGrid
          slots={trayItems.map((id) => ({ id, label: `${trayLabels[id].en} · ${trayLabels[id].hi}`, hint: trayNames[id].en }))}
          purpose="offering"
          value={c.tray}
          onChange={(tray) => onChange({ ...c, tray })}
        />
      </Section>
      <Section title="Flowers" description={`Shown in the flower drawer and falling at the deity's feet. Only the flowers that suit a deity appear for it (Puja offerings). ${tile}`}>
        <SlotGrid
          slots={flowerKinds.map((id) => ({ id, label: `${flowerNames[id].en} · ${flowerNames[id].hi}` }))}
          purpose="offering"
          value={c.flowers}
          onChange={(flowers) => onChange({ ...c, flowers })}
        />
      </Section>
      <Section title="Garlands" description="Hung over the deity. Transparent PNG, a U-shaped garland about 600 × 420.">
        <SlotGrid
          slots={garlandKinds.map((id) => ({ id, label: `${garlandNames[id].en} · ${garlandNames[id].hi}` }))}
          purpose="offering"
          value={c.garlands}
          onChange={(garlands) => onChange({ ...c, garlands })}
        />
      </Section>
      <Section title="Bhog" description={`Shown in the bhog drawer and on the altar plate. ${tile}`}>
        <SlotGrid
          slots={bhogKinds.map((id) => ({ id, label: `${bhogNames[id].en} · ${bhogNames[id].hi}` }))}
          purpose="offering"
          value={c.bhog}
          onChange={(bhog) => onChange({ ...c, bhog })}
        />
      </Section>
    </>
  );
}

export const configEditors: Record<ConfigId, Editor> = {
  gamification: {
    title: "XP & levels",
    description: "XP values, daily caps, fair-play limits and the level curve. The app and the server read these without a release.",
    defaults: () => defaultGamificationConfig,
    normalize: (data) => ({ ...defaultGamificationConfig, ...(data as object) }),
    Editor: GamificationEditor as Editor["Editor"],
  },
  sadhana: {
    title: "Sadhana plan",
    description: "The daily plan targets and the puja tray offerings.",
    defaults: () => defaultSadhanaConfig,
    normalize: (data) => {
      const value = data as SadhanaConfig;
      return {
        ...defaultSadhanaConfig,
        ...value,
        prayerItems: (value.prayerItems ?? defaultSadhanaConfig.prayerItems).map((item) => ({
          ...item,
          label: localizedOf(item.label),
        })),
      };
    },
    Editor: SadhanaEditor as Editor["Editor"],
  },
  puja: {
    title: "Puja offerings",
    description: "Flowers, garland, bhog and tilak for each deity's puja (D-054).",
    defaults: pujaDefaults,
    normalize: (data) => ({ ...pujaDefaults(), ...(data as object) }),
    Editor: PujaEditor as Editor["Editor"],
  },
  visuals: {
    title: "Prayer, Jaap & Meditation visuals",
    description: "Images for the Prayer, Jaap and Meditation screens: backgrounds, the meditation lamp, the toran, the offering tray, flowers, garlands and bhog. Temples and jaap emblems are set on each deity (Deities). Saved images appear in the app on its next start.",
    defaults: emptyVisualsConfig,
    normalize: (data) => ({ ...emptyVisualsConfig(), ...(data as object) }),
    Editor: VisualsEditor as Editor["Editor"],
  },
};
