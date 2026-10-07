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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contentTypes } from "../../domain";
import { badgeCriteria, challengeMetrics } from "../../../../src/domain/progression";
import { offeringKinds, type CatalogKind } from "../../../../src/domain/admin";
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
import { AssetPicker, type PickedArt } from "../../components/panel/media";
import { ContentPicker } from "./ContentPicker";

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
};
const deity: KindDef<DeityForm> = {
  kind: "deity",
  title: "Deities",
  singular: "deity",
  description: "Deities shown in Explore, Jaap, the puja and the Mandir. Active deities need Mandir art.",
  icon: Sparkles,
  empty: () => ({ name: emptyLocalized(), description: emptyLocalized(), aliases: "", isActive: false, isMandirEnabled: true, sortOrder: 0, mandirArt: null }),
  fromDoc: (d) => ({
    name: localizedOf(d.name),
    description: localizedOf(d.description),
    aliases: strings(d.aliases).join(", "),
    isActive: bool(d.isActive),
    isMandirEnabled: bool(d.isMandirEnabled, true),
    sortOrder: num(d.sortOrder),
    mandirArt: artOf(d.mandirArt),
  }),
  toInput: (f) => ({
    name: f.name,
    description: f.description,
    aliases: f.aliases.split(",").map((a) => a.trim()).filter(Boolean),
    isActive: f.isActive,
    isMandirEnabled: f.isMandirEnabled,
    sortOrder: f.sortOrder,
    ...(f.mandirArt ? { mandirArt: f.mandirArt } : {}),
  }),
  row: (d) => ({
    title: localizedOf(d.name).en || "Untitled",
    subtitle: localizedOf(d.name).hi,
    thumb: artOf(d.mandirArt)?.thumb?.key ?? artOf(d.mandirArt)?.mobile.key,
    badges: [active(bool(d.isActive)), ...(bool(d.isMandirEnabled) ? [{ label: "Mandir", tone: "info" as const }] : [])],
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

type OfferingForm = { name: Localized; kind: string; art: PickedArt | null; deityIds: string[]; unlock: "FREE" | "REWARDED_SINGLE_USE"; startAt: string; endAt: string; sortOrder: number; isActive: boolean };
function OfferingFormView({ value: f, onChange: set }: { value: OfferingForm; onChange: (v: OfferingForm) => void }) {
  const deities = useDeityOptions();
  return (
    <div className="space-y-5">
      <LocalizedInput id="offering-name" label="Name" required value={f.name} onChange={(name) => set({ ...f, name })} maxLength={60} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="offering-kind" label="Kind" value={f.kind} options={offeringKinds.map((k) => ({ value: k, label: k }))} onChange={(kind) => set({ ...f, kind })} />
        <SelectField id="offering-unlock" label="Unlock" value={f.unlock} options={[{ value: "FREE", label: "Always free" }, { value: "REWARDED_SINGLE_USE", label: "One rewarded ad, one use (D-040)" }]} onChange={(unlock) => set({ ...f, unlock })} />
      </div>
      <div className="space-y-2">
        <Label>Art</Label>
        <AssetPicker purpose="offering" label="Art" value={f.art} onChange={(art) => set({ ...f, art })} />
      </div>
      <ChipSelect label="Deities" options={deities} value={f.deityIds} onChange={(deityIds) => set({ ...f, deityIds })} hint="None selected: offered to every deity." />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField id="offering-start" label="Available from (optional)" value={f.startAt} onChange={(startAt) => set({ ...f, startAt })} />
        <DateTimeField id="offering-end" label="Available until (optional)" value={f.endAt} onChange={(endAt) => set({ ...f, endAt })} />
      </div>
      <SwitchField id="offering-active" label="Active" checked={f.isActive} onChange={(isActive) => set({ ...f, isActive })} />
      {sorted(f.sortOrder, (sortOrder) => set({ ...f, sortOrder }), "offering-order")}
    </div>
  );
}
const mandirOffering: KindDef<OfferingForm> = {
  kind: "mandirOffering",
  title: "Mandir offerings",
  singular: "offering",
  description: "Basic diya, flowers and bell are always free; special offerings unlock with one rewarded ad (D-040).",
  icon: Flower2,
  empty: () => ({ name: emptyLocalized(), kind: "flower", art: null, deityIds: [], unlock: "FREE", startAt: "", endAt: "", sortOrder: 0, isActive: true }),
  fromDoc: (d) => ({ name: localizedOf(d.name), kind: str(d.kind) || "flower", art: artOf(d.art), deityIds: strings(d.deityIds), unlock: d.unlock === "REWARDED_SINGLE_USE" ? "REWARDED_SINGLE_USE" : "FREE", startAt: iso(d.startAt), endAt: iso(d.endAt), sortOrder: num(d.sortOrder), isActive: bool(d.isActive, true) }),
  toInput: (f) => ({ name: f.name, kind: f.kind, ...(f.art ? { art: f.art } : {}), deityIds: f.deityIds, unlock: f.unlock, ...(f.startAt ? { startAt: f.startAt } : {}), ...(f.endAt ? { endAt: f.endAt } : {}), sortOrder: f.sortOrder, isActive: f.isActive }),
  row: (d) => ({ title: localizedOf(d.name).en || "Untitled", subtitle: `${str(d.kind)} · ${strings(d.deityIds).length ? strings(d.deityIds).join(", ") : "all deities"}`, thumb: artOf(d.art)?.thumb?.key ?? artOf(d.art)?.mobile.key, badges: [active(bool(d.isActive, true)), { label: d.unlock === "REWARDED_SINGLE_USE" ? "Rewarded" : "Free", tone: "info" }] }),
  sort: bySort,
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
