import type { ReactNode } from "react";
import {
  Award,
  CalendarHeart,
  Flower2,
  Library,
  type LucideIcon,
  Sparkles,
  Tags,
  Target,
} from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { contentTypes } from "../../domain";
import { badgeCriteria, challengeMetrics } from "../../../../src/domain/progression";
import {
  offerAtKinds,
  offeringKinds,
  offeringUnlocks,
  offerPlaceLabels,
  offerPlaces,
  templeStageSchema,
  type AssetPurpose,
  type CatalogKind,
  type OfferingKind,
  type OfferingUnlock,
  type OfferPlace,
  type TempleStage,
} from "../../../../src/domain/admin";
import {
  flowerKinds,
  flowerNames,
  forbiddenFlowers,
  type FlowerKind,
} from "../../../../src/domain/puja";
import {
  emptyLocalized,
  LocalizedInput,
  localizedOf,
  type Localized,
} from "../../components/panel/fields";
import {
  ChipSelect,
  DateTimeField,
  NumberField,
  SelectField,
  SwitchField,
  useDeityOptions,
} from "../../components/panel/inputs";
import {
  AssetPicker,
  SoundPicker,
  type PickedArt,
  type PickedSound,
} from "../../components/panel/media";
import { ContentPicker } from "./ContentPicker";
import {
  MurtiPreview,
  OfferPlacePreview,
  StageEditor,
  TemplePreview,
  useTempleOptions,
} from "./StageEditor";

type Doc = Record<string, unknown>;
export type RowView = {
  title: string;
  subtitle?: string;
  thumb?: string | null;
  badges: { label: string; tone?: "on" | "off" | "info" }[];
};
export type KindDef<F> = {
  kind: CatalogKind;
  title: string;
  singular: string;
  description: string;
  icon: LucideIcon;
  empty: () => F;
  fromDoc: (data: Doc) => F;
  toInput: (form: F) => unknown;
  row: (data: Doc) => RowView;
  sort: (a: Doc, b: Doc) => number;
  // Optional grouping of the list (Mandir offerings by kind): a filter and
  // one heading per group.
  group?: {
    label: string;
    of: (data: Doc) => string;
    options: { value: string; label: string }[];
  };
  Form: (props: { value: F; onChange: (value: F) => void }) => ReactNode;
};

const num = (value: unknown, fallback = 0) => (typeof value === "number" ? value : fallback);
const bool = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
const str = (value: unknown) => (typeof value === "string" ? value : "");
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const iso = (value: unknown) => {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function")
    return (value as { toDate(): Date }).toDate().toISOString();
  return typeof value === "string" ? value : "";
};
const artOf = (value: unknown): PickedArt | null => {
  const art = value as PickedArt | undefined;
  return art?.mobile?.key ? art : null;
};
const bySort = (a: Doc, b: Doc) => num(a.sortOrder) - num(b.sortOrder);
const active = (on: boolean, yes = "Active", no = "Hidden") => ({ label: on ? yes : no, tone: on ? ("on" as const) : ("off" as const) });
const sorted = (value: number, set: (value: number) => void, id: string) => (
  <NumberField id={id} label="Order" value={value} min={0} onChange={set} hint="Lower comes first" />
);

// ---- Deities -----------------------------------------------------------------

type DeityForm = {
  name: Localized;
  description: Localized;
  aliases: string;
  isActive: boolean;
  isMandirEnabled: boolean;
  sortOrder: number;
  mandirArt: PickedArt | null;
  shrineArt: PickedArt | null;
  jaapEmblem: PickedArt | null;
  murtiArt: PickedArt | null;
};

// The murti on a checkerboard (its transparency shows) and stood in a temple.
function MurtiField({ value, onChange }: { value: PickedArt | null; onChange: (art: PickedArt | null) => void }) {
  const temples = useTempleOptions();
  const [templeId, setTempleId] = useState("");
  const temple = temples.find((option) => option.value === templeId) ?? temples[0];
  return (
    <div className="space-y-2">
      <Label>Murti</Label>
      <AssetPicker purpose="deity" label="Murti" value={value} onChange={onChange} />
      <p className="text-xs text-muted-foreground">
        The deity alone on a transparent background (PNG or WebP; the transparency is kept), feet at the bottom edge. It stands in whichever temple the devotee swipes to on the Prayer screen.
      </p>
      {value && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Transparency</p>
            <MurtiPreview mediaKey={value.mobile.key} alt="Murti" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">In a temple</p>
            <TemplePreview templeKey={temple?.key} stage={temple?.stage} murtiKey={value.mobile.key} alt={temple?.label ?? "Temple"} />
            {temples.length > 1 && (
              <SelectField id="deity-preview-temple" label="Temple" value={temple?.value ?? ""} options={temples} onChange={setTempleId} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const deity: KindDef<DeityForm> = {
  kind: "deity",
  title: "Deities",
  singular: "deity",
  description: "Deities shown in Explore, Jaap, the puja and the Mandir. Active deities need Mandir art.",
  icon: Sparkles,
  empty: () => ({ name: emptyLocalized(), description: emptyLocalized(), aliases: "", isActive: false, isMandirEnabled: true, sortOrder: 0, mandirArt: null, shrineArt: null, jaapEmblem: null, murtiArt: null }),
  fromDoc: (d) => ({
    name: localizedOf(d.name),
    description: localizedOf(d.description),
    aliases: strings(d.aliases).join(", "),
    isActive: bool(d.isActive),
    isMandirEnabled: bool(d.isMandirEnabled, true),
    sortOrder: num(d.sortOrder),
    mandirArt: artOf(d.mandirArt),
    shrineArt: artOf(d.shrineArt),
    jaapEmblem: artOf(d.jaapEmblem),
    murtiArt: artOf(d.murtiArt),
  }),
  toInput: (f) => ({
    name: f.name,
    description: f.description,
    aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean),
    isActive: f.isActive,
    isMandirEnabled: f.isMandirEnabled,
    sortOrder: f.sortOrder,
    ...(f.mandirArt ? { mandirArt: f.mandirArt } : {}),
    ...(f.shrineArt ? { shrineArt: f.shrineArt } : {}),
    ...(f.jaapEmblem ? { jaapEmblem: f.jaapEmblem } : {}),
    ...(f.murtiArt ? { murtiArt: f.murtiArt } : {}),
  }),
  row: (d) => ({
    title: localizedOf(d.name).en || "Untitled",
    subtitle: localizedOf(d.name).hi,
    thumb: artOf(d.mandirArt)?.thumb?.key ?? artOf(d.mandirArt)?.mobile.key,
    badges: [
      active(bool(d.isActive)),
      ...(bool(d.isMandirEnabled) ? [{ label: "Mandir", tone: "info" as const }] : []),
      ...(artOf(d.murtiArt) ? [{ label: "Murti", tone: "info" as const }] : []),
    ],
  }),
  sort: bySort,
  Form: ({ value: f, onChange: set }) => (
    <div className="space-y-5">
      <LocalizedInput id="deity-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={60} />
      <LocalizedInput id="deity-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={400} />
      <div className="space-y-2">
        <Label htmlFor="deity-aliases">Other names</Label>
        <Input id="deity-aliases" value={f.aliases} onChange={(e) => set({ ...f, aliases: e.target.value })} placeholder="Mahadev, Bholenath, Shankar" />
        <p className="text-xs text-muted-foreground">Comma separated; helps search.</p>
      </div>
      <div className="space-y-2">
        <Label>Mandir art</Label>
        <AssetPicker purpose="deity" label="Art" value={f.mandirArt} onChange={(mandirArt) => set({ ...f, mandirArt })} />
      </div>
      <div className="space-y-2">
        <Label>Prayer temple</Label>
        <AssetPicker purpose="temple" label="Temple" value={f.shrineArt} onChange={(shrineArt) => set({ ...f, shrineArt })} />
        <p className="text-xs text-muted-foreground">
          The whole temple painted with the deity inside, shown on the Prayer screen. Portrait, about 5 : 6 (for example 1500 × 1800), the deity centred and the altar along the bottom edge; a PNG with a transparent background blends best. Empty: the app draws a marble temple around the Mandir art.
        </p>
      </div>
      <MurtiField value={f.murtiArt} onChange={(murtiArt) => set({ ...f, murtiArt })} />
      <div className="space-y-2">
        <Label>Jaap emblem</Label>
        <AssetPicker purpose="decor" label="Emblem" value={f.jaapEmblem} onChange={(jaapEmblem) => set({ ...f, jaapEmblem })} />
        <p className="text-xs text-muted-foreground">
          The symbol above the mantra on the Jaap screen (Krishna&apos;s flute, Shiva&apos;s trishul…). Transparent PNG, wide, about 5 : 2. Empty: the app draws one.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField id="deity-active" label="Active" description="Shown in the app" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
        <SwitchField id="deity-mandir" label="In the Mandir" description="Can be chosen for the Mandir" checked={f.isMandirEnabled} onChange={(isMandirEnabled) => set({ ...f, isMandirEnabled })} />
      </div>
      {sorted(f.sortOrder, (sortOrder) => set({ ...f, sortOrder }), "deity-order")}
    </div>
  ),
};

// ---- Categories ----------------------------------------------------------------

type CategoryForm = { name: Localized; description: Localized; contentTypes: string[]; isActive: boolean; sortOrder: number };
const category: KindDef<CategoryForm> = {
  kind: "category",
  title: "Categories",
  singular: "category",
  description: "Browse categories for Explore, limited to the content types they apply to.",
  icon: Tags,
  empty: () => ({ name: emptyLocalized(), description: emptyLocalized(), contentTypes: [], isActive: true, sortOrder: 0 }),
  fromDoc: (d) => ({ name: localizedOf(d.name), description: localizedOf(d.description), contentTypes: strings(d.contentTypes), isActive: bool(d.isActive, true), sortOrder: num(d.sortOrder) }),
  toInput: (f) => f,
  row: (d) => ({ title: localizedOf(d.name).en || "Untitled", subtitle: localizedOf(d.name).hi, badges: [active(bool(d.isActive, true)), ...strings(d.contentTypes).map((t) => ({ label: t.toLowerCase(), tone: "info" as const }))] }),
  sort: bySort,
  Form: ({ value: f, onChange: set }) => (
    <div className="space-y-5">
      <LocalizedInput id="category-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={60} />
      <LocalizedInput id="category-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={300} />
      <ChipSelect label="Content types" options={contentTypes.map((t) => ({ value: t, label: t.toLowerCase() }))} value={f.contentTypes} onChange={(contentTypes) => set({ ...f, contentTypes })} hint="Leave empty for all types." />
      <SwitchField id="category-active" label="Active" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
      {sorted(f.sortOrder, (sortOrder) => set({ ...f, sortOrder }), "category-order")}
    </div>
  ),
};

// ---- Collections ---------------------------------------------------------------

type CollectionForm = { title: Localized; description: Localized; cover: PickedArt | null; itemIds: string[]; isFeatured: boolean; isPublished: boolean; sortOrder: number };
const collection: KindDef<CollectionForm> = {
  kind: "collection",
  title: "Collections",
  singular: "collection",
  description: "Editorial collections used by Home rails and festivals.",
  icon: Library,
  empty: () => ({ title: emptyLocalized(), description: emptyLocalized(), cover: null, itemIds: [], isFeatured: false, isPublished: false, sortOrder: 0 }),
  fromDoc: (d) => {
    const cover = (d.cover as { thumb?: PickedArt["mobile"] } | undefined)?.thumb;
    return { title: localizedOf(d.title), description: localizedOf(d.description), cover: cover ? { mobile: cover, thumb: cover } : null, itemIds: strings(d.itemIds), isFeatured: bool(d.isFeatured), isPublished: bool(d.isPublished), sortOrder: num(d.sortOrder) };
  },
  toInput: (f) => ({
    title: f.title,
    description: f.description,
    ...(f.cover ? { cover: { thumb: f.cover.thumb ?? f.cover.mobile } } : {}),
    itemIds: f.itemIds,
    isFeatured: f.isFeatured,
    isPublished: f.isPublished,
    sortOrder: f.sortOrder,
  }),
  row: (d) => ({
    title: localizedOf(d.title).en || "Untitled",
    subtitle: `${strings(d.itemIds).length} items`,
    thumb: (d.cover as { thumb?: { key?: string } } | undefined)?.thumb?.key,
    badges: [active(bool(d.isPublished), "Published", "Draft"), ...(bool(d.isFeatured) ? [{ label: "Featured", tone: "info" as const }] : [])],
  }),
  sort: bySort,
  Form: ({ value: f, onChange: set }) => (
    <div className="space-y-5">
      <LocalizedInput id="collection-title" label="Title" required value={f.title} onChange={(title) => set({ ...f, title })} maxLength={80} />
      <LocalizedInput id="collection-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={400} />
      <div className="space-y-2">
        <Label>Cover</Label>
        <AssetPicker purpose="collection" label="Cover" value={f.cover} onChange={(cover) => set({ ...f, cover })} />
      </div>
      <ContentPicker value={f.itemIds} onChange={(itemIds) => set({ ...f, itemIds })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField id="collection-published" label="Published" checked={f.isPublished} onChange={(isPublished) => set({ ...f, isPublished })} />
        <SwitchField id="collection-featured" label="Featured" checked={f.isFeatured} onChange={(isFeatured) => set({ ...f, isFeatured })} />
      </div>
      {sorted(f.sortOrder, (sortOrder) => set({ ...f, sortOrder }), "collection-order")}
    </div>
  ),
};

// ---- Challenges ----------------------------------------------------------------

const metricLabels: Record<string, string> = {
  SADHANA_TASKS_COMPLETED: "Sadhana tasks completed",
  FULL_SADHANA_DAYS: "Full Sadhana days",
  JAAP_MALAS: "Jaap malas",
  MEDITATION_MINUTES: "Meditation minutes",
  CONTENT_LISTEN_COMPLETE: "Content listened to the end",
  MANDIR_VISITS: "Mandir visits",
  STREAK_DAYS: "Streak days",
};
type ChallengeForm = { title: Localized; description: Localized; period: "DAILY" | "WEEKLY"; metric: string; targetValue: number; xpReward: number; badgeId: string; audience: "ALL" | "SIGNED_IN"; isActive: boolean; startAt: string; endAt: string };
const challenge: KindDef<ChallengeForm> = {
  kind: "challenge",
  title: "Challenges",
  singular: "challenge",
  description: "Daily and weekly sankalps. Keep at least two weeks queued.",
  icon: Target,
  empty: () => {
    const start = new Date();
    start.setHours(4, 0, 0, 0);
    return { title: emptyLocalized(), description: emptyLocalized(), period: "DAILY", metric: "JAAP_MALAS", targetValue: 2, xpReward: 20, badgeId: "", audience: "ALL", isActive: true, startAt: start.toISOString(), endAt: new Date(start.getTime() + 7 * 86400000).toISOString() };
  },
  fromDoc: (d) => ({ title: localizedOf(d.title), description: localizedOf(d.description), period: d.period === "WEEKLY" ? "WEEKLY" : "DAILY", metric: str(d.metric) || "JAAP_MALAS", targetValue: num(d.targetValue, 1), xpReward: num(d.xpReward), badgeId: str(d.badgeId), audience: d.audience === "SIGNED_IN" ? "SIGNED_IN" : "ALL", isActive: bool(d.isActive, true), startAt: iso(d.startAt), endAt: iso(d.endAt) }),
  toInput: (f) => ({ title: f.title, description: f.description, period: f.period, metric: f.metric, targetValue: f.targetValue, xpReward: f.xpReward, ...(f.badgeId ? { badgeId: f.badgeId } : {}), audience: f.audience, isActive: f.isActive, startAt: f.startAt, endAt: f.endAt }),
  row: (d) => ({
    title: localizedOf(d.title).en || "Untitled",
    subtitle: `${metricLabels[str(d.metric)] ?? str(d.metric)} · ${num(d.targetValue)} · +${num(d.xpReward)} XP`,
    badges: [active(bool(d.isActive)), { label: d.period === "WEEKLY" ? "Weekly" : "Daily", tone: "info" }, { label: `${iso(d.startAt).slice(0, 10)} → ${iso(d.endAt).slice(0, 10)}` }],
  }),
  sort: (a, b) => iso(a.startAt).localeCompare(iso(b.startAt)),
  Form: ({ value: f, onChange: set }) => (
    <div className="space-y-5">
      <LocalizedInput id="challenge-title" label="Title" required value={f.title} onChange={(title) => set({ ...f, title })} maxLength={80} />
      <LocalizedInput id="challenge-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="challenge-period" label="Period" value={f.period} options={[{ value: "DAILY", label: "Daily (resets at 04:00)" }, { value: "WEEKLY", label: "Weekly (Monday 04:00 IST)" }]} onChange={(period) => set({ ...f, period })} />
        <SelectField id="challenge-metric" label="What counts" value={f.metric} options={challengeMetrics.map((m) => ({ value: m, label: metricLabels[m] ?? m }))} onChange={(metric) => set({ ...f, metric })} />
        <NumberField id="challenge-target" label="Target" value={f.targetValue} min={1} onChange={(targetValue) => set({ ...f, targetValue })} />
        <NumberField id="challenge-xp" label="XP reward" value={f.xpReward} min={0} onChange={(xpReward) => set({ ...f, xpReward })} />
        <DateTimeField id="challenge-start" label="Starts" value={f.startAt} onChange={(startAt) => set({ ...f, startAt })} />
        <DateTimeField id="challenge-end" label="Ends" value={f.endAt} onChange={(endAt) => set({ ...f, endAt })} />
        <SelectField id="challenge-audience" label="Who" value={f.audience} options={[{ value: "ALL", label: "Everyone" }, { value: "SIGNED_IN", label: "Signed-in only" }]} onChange={(audience) => set({ ...f, audience })} />
        <div className="space-y-2">
          <Label htmlFor="challenge-badge">Badge on completion (optional)</Label>
          <Input id="challenge-badge" value={f.badgeId} onChange={(e) => set({ ...f, badgeId: e.target.value.trim() })} placeholder="badge id" />
        </div>
      </div>
      <SwitchField id="challenge-active" label="Active" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
    </div>
  ),
};

// ---- Badges --------------------------------------------------------------------

const criteriaLabels: Record<string, string> = {
  SADHANA_TASKS: "Sadhana tasks",
  STREAK_DAYS: "Longest streak (days)",
  TOTAL_MALAS: "Total malas",
  MEDITATION_MINUTES: "Meditation minutes",
  BRAHMA_MUHURTA_DAYS: "Brahma Muhurta days",
  MANDIR_VISITS: "Mandir visits",
  CHALLENGES_COMPLETED: "Challenges completed",
  TOTAL_XP: "Total XP",
  LEAGUE_PROMOTIONS: "League promotions",
  LEAGUE_TIER: "League tier reached",
};
const iconKeys = ["lotus", "diya", "sun", "mala", "om", "sunrise", "temple", "flag", "arrow", "crown", "star"];
type BadgeForm = { name: Localized; description: Localized; iconKey: string; criteriaType: string; criteriaValue: string; xpReward: number; isActive: boolean };
const badge: KindDef<BadgeForm> = {
  kind: "badge",
  title: "Badges",
  singular: "badge",
  description: "Milestones devotees unlock. League badges are awarded by the weekly rollover (M3).",
  icon: Award,
  empty: () => ({ name: emptyLocalized(), description: emptyLocalized(), iconKey: "lotus", criteriaType: "SADHANA_TASKS", criteriaValue: "1", xpReward: 10, isActive: true }),
  fromDoc: (d) => ({ name: localizedOf(d.name), description: localizedOf(d.description), iconKey: str(d.iconKey) || "lotus", criteriaType: str(d.criteriaType) || "SADHANA_TASKS", criteriaValue: String(d.criteriaValue ?? ""), xpReward: num(d.xpReward), isActive: bool(d.isActive, true) }),
  toInput: (f) => ({ name: f.name, description: f.description, iconKey: f.iconKey, criteriaType: f.criteriaType, criteriaValue: f.criteriaType === "LEAGUE_TIER" ? f.criteriaValue : Number(f.criteriaValue), xpReward: f.xpReward, isActive: f.isActive }),
  row: (d) => ({ title: localizedOf(d.name).en || "Untitled", subtitle: `${criteriaLabels[str(d.criteriaType)] ?? str(d.criteriaType)} ≥ ${String(d.criteriaValue)} · +${num(d.xpReward)} XP`, badges: [active(bool(d.isActive, true)), { label: str(d.iconKey), tone: "info" }] }),
  sort: (a, b) => str(a.criteriaType).localeCompare(str(b.criteriaType)) || Number(a.criteriaValue) - Number(b.criteriaValue),
  Form: ({ value: f, onChange: set }) => (
    <div className="space-y-5">
      <LocalizedInput id="badge-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={60} />
      <LocalizedInput id="badge-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="badge-criteria" label="Unlocks when" value={f.criteriaType} options={badgeCriteria.map((c) => ({ value: c, label: criteriaLabels[c] ?? c }))} onChange={(criteriaType) => set({ ...f, criteriaType })} />
        {f.criteriaType === "LEAGUE_TIER" ? (
          <SelectField id="badge-value" label="Tier" value={f.criteriaValue} options={["SILVER", "GOLD", "DIAMOND", "DIVINE"].map((t) => ({ value: t, label: t.toLowerCase() }))} onChange={(criteriaValue) => set({ ...f, criteriaValue })} />
        ) : (
          <NumberField id="badge-value" label="Reaches at least" value={Number(f.criteriaValue)} min={1} onChange={(v) => set({ ...f, criteriaValue: String(v) })} />
        )}
        <SelectField id="badge-icon" label="Icon" value={f.iconKey} options={iconKeys.map((i) => ({ value: i, label: i }))} onChange={(iconKey) => set({ ...f, iconKey })} />
        <NumberField id="badge-xp" label="XP reward" value={f.xpReward} min={0} onChange={(xpReward) => set({ ...f, xpReward })} />
      </div>
      <SwitchField id="badge-active" label="Active" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
    </div>
  ),
};

// ---- Festivals -----------------------------------------------------------------

type FestivalForm = { name: Localized; description: Localized; date: string; endDate: string; image: PickedArt | null; deityIds: string[]; collectionId: string; isFeatured: boolean; isPublished: boolean };
function FestivalFormView({ value: f, onChange: set }: { value: FestivalForm; onChange: (v: FestivalForm) => void }) {
  const deities = useDeityOptions();
  return (
    <div className="space-y-5">
      <LocalizedInput id="festival-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={80} />
      <LocalizedInput id="festival-description" label="Description" multiline value={f.description} onChange={(description) => set({ ...f, description })} maxLength={600} />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField id="festival-date" type="date" label="Date" value={f.date} onChange={(date) => set({ ...f, date })} />
        <DateTimeField id="festival-end" type="date" label="Ends (optional)" value={f.endDate} onChange={(endDate) => set({ ...f, endDate })} />
      </div>
      <div className="space-y-2">
        <Label>Image</Label>
        <AssetPicker purpose="festival" value={f.image} onChange={(image) => set({ ...f, image })} />
      </div>
      <ChipSelect label="Deities" options={deities} value={f.deityIds} onChange={(deityIds) => set({ ...f, deityIds })} />
      <div className="space-y-2">
        <Label htmlFor="festival-collection">Linked collection (optional)</Label>
        <Input id="festival-collection" value={f.collectionId} onChange={(e) => set({ ...f, collectionId: e.target.value.trim() })} placeholder="collection id" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField id="festival-published" label="Published" description="Verify the date against a published calendar first" checked={f.isPublished} onChange={(isPublished) => set({ ...f, isPublished })} />
        <SwitchField id="festival-featured" label="Featured" checked={f.isFeatured} onChange={(isFeatured) => set({ ...f, isFeatured })} />
      </div>
    </div>
  );
}
const festival: KindDef<FestivalForm> = {
  kind: "festival",
  title: "Festivals",
  singular: "festival",
  description: "Festival dates are entered by hand (D-034). Enter the next 12 months and check each date.",
  icon: CalendarHeart,
  empty: () => ({ name: emptyLocalized(), description: emptyLocalized(), date: "", endDate: "", image: null, deityIds: [], collectionId: "", isFeatured: false, isPublished: false }),
  fromDoc: (d) => ({ name: localizedOf(d.name), description: localizedOf(d.description), date: str(d.date), endDate: str(d.endDate), image: artOf(d.image), deityIds: strings(d.deityIds), collectionId: str(d.collectionId), isFeatured: bool(d.isFeatured), isPublished: bool(d.isPublished) }),
  toInput: (f) => ({ name: f.name, description: f.description, date: f.date, ...(f.endDate ? { endDate: f.endDate } : {}), ...(f.image ? { image: f.image } : {}), deityIds: f.deityIds, ...(f.collectionId ? { collectionId: f.collectionId } : {}), isFeatured: f.isFeatured, isPublished: f.isPublished }),
  row: (d) => ({ title: localizedOf(d.name).en || "Untitled", subtitle: str(d.date) + (str(d.endDate) ? ` → ${str(d.endDate)}` : ""), thumb: artOf(d.image)?.thumb?.key ?? artOf(d.image)?.mobile.key, badges: [active(bool(d.isPublished), "Published", "Draft"), ...(str(d.collectionId) ? [] : [{ label: "No collection" }])] }),
  sort: (a, b) => str(a.date).localeCompare(str(b.date)),
  Form: FestivalFormView,
};

// ---- Mandir offerings ----------------------------------------------------------

export const offeringKindLabels: Record<OfferingKind, string> = {
  temple: "Temple",
  light: "Lights",
  bell: "Bell",
  flower: "Flower",
  garland: "Garland",
  diya: "Diya",
  ornament: "Ornament",
  bhog: "Bhog",
  other: "Other",
};
// Decor first: the order of the kind filter and of the groups in the list.
const offeringKindOrder: OfferingKind[] = ["temple", "light", "bell", "flower", "garland", "diya", "ornament", "bhog", "other"];
export const unlockLabels: Record<OfferingUnlock, string> = {
  FREE: "Free",
  REWARDED: "Unlock with one ad (kept)",
  REWARDED_SINGLE_USE: "One ad per use",
};
const unlockHints: Record<OfferingUnlock, string> = {
  FREE: "Always available.",
  REWARDED: "The devotee watches one ad once; it stays unlocked on that phone.",
  REWARDED_SINGLE_USE: "One ad each time it is used.",
};
const unlockBadges: Record<OfferingUnlock, string> = { FREE: "Free", REWARDED: "Ad · kept", REWARDED_SINGLE_USE: "Ad · each use" };
type Placement = "top" | "bottom" | "sides";
const placementOptions: { value: Placement; label: string }[] = [
  { value: "top", label: "Top (hangs over the temple)" },
  { value: "bottom", label: "Bottom (along the base)" },
  { value: "sides", label: "Sides (left and right)" },
];
// Special offerings (garland, ornament, diya, bhog, other): where on the
// murti or the altar the item is placed (offerAt).
const offerPlaceOptions: { value: OfferPlace; label: string }[] = offerPlaces.map((place) => ({
  value: place,
  label: `${offerPlaceLabels[place].en} / ${offerPlaceLabels[place].hi}`,
}));
const takesOfferAt = (kind: OfferingKind) => (offerAtKinds as readonly OfferingKind[]).includes(kind);
const asOfferPlace = (value: unknown): OfferPlace | "" =>
  (offerPlaces as readonly string[]).includes(value as string) ? (value as OfferPlace) : "";
// Which library the image comes from, by kind.
const artPurpose = (kind: OfferingKind): AssetPurpose =>
  kind === "temple" ? "temple" : kind === "light" || kind === "bell" ? "decor" : "offering";
const artHints: Partial<Record<OfferingKind, string>> = {
  temple: "Portrait, about 5 : 6; the sanctum left empty for the deity. Then mark where the deity stands below.",
  light: "Transparent PNG or WebP, drawn over the temple.",
  bell: "Transparent PNG or WebP of the bell.",
  flower: "Transparent PNG or WebP of a single flower.",
  ...Object.fromEntries(offerAtKinds.map((kind) => [kind, "Transparent PNG or WebP of the item alone; it is drawn at its place on the murti or the altar."])),
};
const asKind = (value: unknown): OfferingKind => (offeringKinds as readonly string[]).includes(value as string) ? (value as OfferingKind) : "flower";
const asUnlock = (value: unknown): OfferingUnlock => (offeringUnlocks as readonly string[]).includes(value as string) ? (value as OfferingUnlock) : "FREE";
const asFlower = (value: unknown): FlowerKind | "" => (flowerKinds as readonly string[]).includes(value as string) ? (value as FlowerKind) : "";
const asPlacement = (value: unknown): Placement => (value === "bottom" || value === "sides" ? value : "top");
const stageOf = (value: unknown): TempleStage | null => {
  const parsed = templeStageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
const soundOf = (value: unknown): PickedSound | null => {
  const sound = value as PickedSound | undefined;
  return sound?.audio?.key ? sound : null;
};
// Deities among `deityIds` that must never receive this flower (tulsi to Shiva…).
export const forbiddenFor = (flower: FlowerKind | "", deityIds: string[]) =>
  flower ? deityIds.filter((id) => (forbiddenFlowers[id] ?? []).includes(flower)) : [];

export type OfferingForm = {
  name: Localized;
  kind: OfferingKind;
  art: PickedArt | null;
  flowerKind: FlowerKind | "";
  sound: PickedSound | null;
  placement: Placement;
  stage: TempleStage | null;
  offerAt: OfferPlace | "";
  deityIds: string[];
  unlock: OfferingUnlock;
  startAt: string;
  endAt: string;
  sortOrder: number;
  isActive: boolean;
};

function UnlockField({ value, onChange }: { value: OfferingUnlock; onChange: (value: OfferingUnlock) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">How devotees get it</legend>
      <RadioGroup value={value} onValueChange={(next) => onChange(next as OfferingUnlock)} className="gap-2">
        {offeringUnlocks.map((unlock) => (
          <label key={unlock} htmlFor={`offering-unlock-${unlock}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem id={`offering-unlock-${unlock}`} value={unlock} className="mt-0.5" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">{unlockLabels[unlock]}</span>
              <span className="block text-xs text-muted-foreground">{unlockHints[unlock]}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function OfferingFormView({ value: f, onChange: set }: { value: OfferingForm; onChange: (v: OfferingForm) => void }) {
  const deities = useDeityOptions();
  const refused = forbiddenFor(f.flowerKind, f.deityIds);
  const nameOf = (id: string) => deities.find((d) => d.value === id)?.label ?? id;
  return (
    <div className="space-y-5">
      <LocalizedInput id="offering-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={60} />
      <SelectField id="offering-kind" label="Kind" value={f.kind} options={offeringKindOrder.map((k) => ({ value: k, label: offeringKindLabels[k] }))} onChange={(kind) => set({ ...f, kind })} />
      <div className="space-y-2">
        <Label>Image</Label>
        <AssetPicker purpose={artPurpose(f.kind)} label="Image" value={f.art} onChange={(art) => set({ ...f, art })} />
        {artHints[f.kind] && <p className="text-xs text-muted-foreground">{artHints[f.kind]}</p>}
      </div>
      {f.kind === "temple" && (
        <div className="space-y-2">
          <Label>Where the deity stands</Label>
          <StageEditor templeKey={f.art?.mobile.key} value={f.stage} onChange={(stage) => set({ ...f, stage })} />
        </div>
      )}
      {f.kind === "bell" && (
        <div className="space-y-2">
          <Label>Bell sound</Label>
          <SoundPicker label="Sound" value={f.sound} onChange={(sound) => set({ ...f, sound })} />
        </div>
      )}
      {f.kind === "light" && (
        <SelectField id="offering-placement" label="Where it hangs" value={f.placement} options={placementOptions} onChange={(placement) => set({ ...f, placement })} />
      )}
      {takesOfferAt(f.kind) && (
        <div className="space-y-2">
          <SelectField
            id="offering-offer-at"
            label="Where it is offered"
            value={f.offerAt}
            placeholder="Choose the place…"
            options={offerPlaceOptions}
            onChange={(offerAt) => set({ ...f, offerAt })}
          />
          <p className="text-xs text-muted-foreground">Where the devotee sees it in the Mandir: on the head (mukut), round the neck (garland, haar), above the deity (chhatra), at the feet, or on the altar in front (diya, bhog, thali).</p>
          {f.offerAt && (
            <OfferPlacePreview place={f.offerAt} itemKey={f.art?.mobile.key} itemLabel={f.name.en || "Offering"} deityIds={f.deityIds} />
          )}
        </div>
      )}
      {f.kind === "flower" && (
        <div className="space-y-2">
          <SelectField
            id="offering-flower"
            label="Which flower"
            value={f.flowerKind}
            placeholder="Choose the flower…"
            options={flowerKinds.map((k) => ({ value: k, label: `${flowerNames[k].en} · ${flowerNames[k].hi}` }))}
            onChange={(flowerKind) => set({ ...f, flowerKind })}
          />
          <p className="text-xs text-muted-foreground">The deity rules use it: a flower is never shown to a deity it must not be offered to.</p>
        </div>
      )}
      <UnlockField value={f.unlock} onChange={(unlock) => set({ ...f, unlock })} />
      <ChipSelect label="Deities" options={deities} value={f.deityIds} onChange={(deityIds) => set({ ...f, deityIds })} hint="None selected: for every deity." />
      {refused.length > 0 && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {flowerNames[f.flowerKind as FlowerKind].en} must not be offered to {refused.map(nameOf).join(", ")}. Remove {refused.length === 1 ? "that deity" : "those deities"} or choose another flower.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField id="offering-start" label="Available from (optional)" value={f.startAt} onChange={(startAt) => set({ ...f, startAt })} />
        <DateTimeField id="offering-end" label="Available until (optional)" value={f.endAt} onChange={(endAt) => set({ ...f, endAt })} />
      </div>
      <SwitchField id="offering-active" label="Active" description="Shown in the app" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
      {sorted(f.sortOrder, (sortOrder) => set({ ...f, sortOrder }), "offering-order")}
    </div>
  );
}
const mandirOffering: KindDef<OfferingForm> = {
  kind: "mandirOffering",
  title: "Mandir offerings",
  singular: "offering",
  description: "Temples, lights, bells, flowers and special offerings for the Mandir. Each is free or unlocked with a rewarded ad.",
  icon: Flower2,
  empty: () => ({ name: emptyLocalized(), kind: "temple", art: null, flowerKind: "", sound: null, placement: "top", stage: null, offerAt: "", deityIds: [], unlock: "FREE", startAt: "", endAt: "", sortOrder: 0, isActive: true }),
  fromDoc: (d) => ({
    name: localizedOf(d.name),
    kind: asKind(d.kind),
    art: artOf(d.art),
    flowerKind: asFlower(d.flowerKind),
    sound: soundOf(d.sound),
    placement: asPlacement(d.placement),
    stage: stageOf(d.stage),
    offerAt: asOfferPlace(d.offerAt),
    deityIds: strings(d.deityIds),
    unlock: asUnlock(d.unlock),
    startAt: iso(d.startAt),
    endAt: iso(d.endAt),
    sortOrder: num(d.sortOrder),
    isActive: bool(d.isActive, true),
  }),
  // Only the fields of the chosen kind are sent (the server refuses others).
  toInput: (f) => ({
    name: f.name,
    kind: f.kind,
    ...(f.art ? { art: f.art } : {}),
    ...(f.kind === "temple" && f.stage ? { stage: f.stage } : {}),
    ...(f.kind === "bell" && f.sound ? { sound: f.sound } : {}),
    ...(f.kind === "light" ? { placement: f.placement } : {}),
    ...(f.kind === "flower" && f.flowerKind ? { flowerKind: f.flowerKind } : {}),
    ...(takesOfferAt(f.kind) && f.offerAt ? { offerAt: f.offerAt } : {}),
    deityIds: f.deityIds,
    unlock: f.unlock,
    ...(f.startAt ? { startAt: f.startAt } : {}),
    ...(f.endAt ? { endAt: f.endAt } : {}),
    sortOrder: f.sortOrder,
    isActive: f.isActive,
  }),
  row: (d) => {
    const kind = asKind(d.kind);
    const unlock = asUnlock(d.unlock);
    const flower = asFlower(d.flowerKind);
    const place = takesOfferAt(kind) ? asOfferPlace(d.offerAt) : "";
    return {
      title: localizedOf(d.name).en || "Untitled",
      subtitle: [
        localizedOf(d.name).hi,
        flower ? flowerNames[flower].en : "",
        place ? `${offerPlaceLabels[place].en} / ${offerPlaceLabels[place].hi}` : "",
        strings(d.deityIds).length ? strings(d.deityIds).join(", ") : "all deities",
      ].filter(Boolean).join(" · "),
      thumb: artOf(d.art)?.thumb?.key ?? artOf(d.art)?.mobile.key ?? null,
      badges: [
        active(bool(d.isActive, true)),
        { label: unlockBadges[unlock], tone: "info" },
        { label: `Order ${num(d.sortOrder)}` },
        ...(kind === "bell" && !soundOf(d.sound) ? [{ label: "No sound" }] : []),
      ],
    };
  },
  sort: (a, b) =>
    offeringKindOrder.indexOf(asKind(a.kind)) - offeringKindOrder.indexOf(asKind(b.kind)) || bySort(a, b),
  group: {
    label: "Kind",
    of: (d) => asKind(d.kind),
    options: offeringKindOrder.map((k) => ({ value: k, label: offeringKindLabels[k] })),
  },
  Form: OfferingFormView,
};

export const kindDefs: Record<CatalogKind, KindDef<any>> = {
  deity,
  category,
  collection,
  challenge,
  badge,
  festival,
  mandirOffering,
};
