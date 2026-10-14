import type { ImageSourcePropType } from "react-native";
import type { AudioSource } from "expo-audio";
import { DecorItem, decorFor } from "../../../domain/mandirDecor";
import { forbiddenFlowers, offeringsFor } from "../../../domain/puja";
import type { OfferPlace, OfferingKind } from "../../../domain/admin";
import {
  decideSaveGate,
  RewardedUnlockType,
  SaveGate,
  SaveVia,
  unlockFromOutcome,
} from "../../../domain/saveGate";
import type { RewardedAdPresenter } from "../../../services/ads/rewardedGate";
import { requiresRewardedAd } from "../../../services/integrations";
import type { RemoteConfigService } from "../../../services/remoteConfig/defaults";

// Mandir decor as the Mandir draws it: a published mandirOfferings
// item (or a bundled one) with its image and sound ready to load.
export type MandirDecor = Omit<DecorItem, "imageKey" | "soundKey"> & {
  image: ImageSourcePropType;
  // Width / height when known before loading (bundled files).
  aspect?: number;
  // A CDN image's bundled copy (same id), drawn while the CDN one loads.
  placeholder?: ImageSourcePropType;
  // Bells: the sound when rung.
  sound?: AudioSource;
};

// The deity alone on a transparent background.
export type Murti = {
  source: ImageSourcePropType;
  aspect?: number;
  // The bundled murti, drawn while a CDN one loads.
  placeholder?: ImageSourcePropType;
};

// lightId saved for "No lights".
export const NO_LIGHT = "none";

// Bundled defaults merged with the published catalogue: a published item
// with the same id overrides the bundled one (name, unlock, order, stage…).
// Its image and sound come from the CDN; when a key cannot be resolved (no
// CDN configured, placeholder key) the bundled file of that id is kept, and
// a new item with nothing to draw is skipped.
export function mergeDecor(
  bundled: MandirDecor[],
  remote: DecorItem[],
  resolve: (key: string) => string | null,
): MandirDecor[] {
  const byId = new Map(bundled.map((item) => [item.id, item]));
  for (const item of remote) {
    const base = byId.get(item.id);
    const { imageKey, soundKey, ...fields } = item;
    const uri = resolve(imageKey);
    const image = uri ? { uri } : base?.image;
    if (!image) continue;
    const soundUri = soundKey ? resolve(soundKey) : null;
    const sound = soundUri ? { uri: soundUri } : base?.sound;
    const aspect = uri ? undefined : base?.aspect;
    byId.set(item.id, {
      ...fields,
      image,
      ...(uri && base?.image ? { placeholder: base.image } : {}),
      ...(aspect !== undefined ? { aspect } : {}),
      ...(sound !== undefined ? { sound } : {}),
      stage: fields.stage ?? base?.stage,
      placement: fields.placement ?? base?.placement,
      flowerKind: fields.flowerKind ?? base?.flowerKind,
      offerAt: fields.offerAt ?? base?.offerAt,
    });
  }
  return [...byId.values()];
}

// The murti stood in the temple: the catalogue's murtiArt when the CDN can
// serve it, else the bundled one for the deity, else none (the screen then
// draws the deity's own art).
export function murtiFor(
  deity: { id: string; murtiKey?: string } | undefined,
  resolve: (key: string) => string | null,
  bundled: (deityId: string) => Murti | null,
): Murti | null {
  if (!deity) return null;
  const uri = deity.murtiKey ? resolve(deity.murtiKey) : null;
  const local = bundled(deity.id);
  if (uri)
    return {
      source: { uri },
      ...(local ? { placeholder: local.source } : {}),
    };
  return local;
}

// Flowers for the deity's drawer: decor flowers whose traditional kind suits
// the deity (offeringsFor) or that the admin gave to this deity by name, and
// never one of its forbidden flowers. A flower without a kind is offered only
// when it names the deity. The first flower is made free when none is, so
// the day's prayer never needs an ad.
export function flowersFor(
  items: MandirDecor[],
  deityId: string | null | undefined,
): MandirDecor[] {
  const id = deityId ?? undefined;
  const suited = offeringsFor(deityId).flowers;
  const banned = (id && forbiddenFlowers[id]) || [];
  const named = (item: MandirDecor) =>
    id !== undefined && item.deityIds.includes(id);
  const list = decorFor(items, "flower", id).filter((item) => {
    if (!item.flowerKind) return named(item);
    if (banned.includes(item.flowerKind)) return false;
    return suited.includes(item.flowerKind) || named(item);
  });
  if (list.length && !list.some((item) => item.unlock === "FREE"))
    list[0] = { ...list[0], unlock: "FREE" };
  return list;
}

// ---- Special offerings (D-040) ---------------------------------------------

// The kinds offered from the "special offerings" drawer, one rewarded ad per
// use; each is placed in the scene at its offerAt.
export const specialKinds: readonly OfferingKind[] = [
  "garland",
  "ornament",
  "diya",
  "bhog",
  "other",
];
const defaultPlace: Partial<Record<OfferingKind, OfferPlace>> = {
  garland: "neck",
  ornament: "head",
};
export function offerPlaceOf(
  item: Pick<MandirDecor, "kind" | "offerAt">,
): OfferPlace {
  return item.offerAt ?? defaultPlace[item.kind] ?? "altar";
}

// The special offerings for a deity (every deity's and its own), in order.
export function specialsFor(
  items: MandirDecor[],
  deityId: string | null | undefined,
): MandirDecor[] {
  const id = deityId ?? undefined;
  return specialKinds
    .flatMap((kind) => decorFor(items, kind, id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

// A special offering in the scene for this visit.
export type PlacedSpecial = {
  key: number;
  id: string;
  image: ImageSourcePropType;
  aspect?: number;
  place: OfferPlace;
  // Altar position (0 nearest the lamp).
  slot: number;
};
// At most this many offerings stand on the altar; one each on the head,
// round the neck, above the deity and at the feet. A new one takes the
// place of the oldest there.
export const ALTAR_SLOTS = 4;
export function placeSpecial(
  placed: PlacedSpecial[],
  item: MandirDecor,
  key: number,
): PlacedSpecial[] {
  const place = offerPlaceOf(item);
  const here = placed.filter((entry) => entry.place === place);
  const others = placed.filter((entry) => entry.place !== place);
  const kept =
    place === "altar"
      ? here.filter((entry) => entry.id !== item.id).slice(-(ALTAR_SLOTS - 1))
      : [];
  const used = new Set(kept.map((entry) => entry.slot));
  const slot = Array.from({ length: ALTAR_SLOTS }, (_, i) => i).find(
    (i) => !used.has(i),
  );
  return [
    ...others,
    ...kept,
    {
      key,
      id: item.id,
      image: item.image,
      ...(item.aspect !== undefined ? { aspect: item.aspect } : {}),
      place,
      slot: slot ?? 0,
    },
  ];
}

// ---- Unlocking with a rewarded ad (doc 11 §4) ----------------------------

type GateConfig = Pick<RemoteConfigService, "getBoolean">;
// ads_all_enabled is the master switch over every ad format.
export function rewardedAdsOn(config: GateConfig): boolean {
  return (
    config.getBoolean("ads_all_enabled") &&
    config.getBoolean("ads_rewarded_enabled")
  );
}

// Same rule as saving a wallpaper: with rewarded ads off, everything is free.
export function decorGate(
  item: Pick<MandirDecor, "unlock">,
  adsOn: boolean,
): SaveGate {
  return decideSaveGate({
    actionRequiresAd: requiresRewardedAd("offering"),
    itemGate: item.unlock === "FREE" ? "FREE" : "REWARDED",
    rewardedAdsEnabled: adsOn,
  });
}

export type UnlockState = {
  adsOn: boolean;
  // Ids unlocked for good on this device (REWARDED), from local storage.
  unlocked: readonly string[];
  // Ids unlocked for this visit only (REWARDED_SINGLE_USE).
  visit: ReadonlySet<string>;
};
export function isLocked(
  item: Pick<MandirDecor, "id" | "unlock">,
  state: UnlockState,
): boolean {
  if (decorGate(item, state.adsOn) === "free") return false;
  if (item.unlock === "REWARDED" && state.unlocked.includes(item.id))
    return false;
  return !state.visit.has(item.id);
}

// Plays one rewarded ad. No fill (no ad within the timeout) and ad errors
// still unlock: the devotee is never blocked by ads (doc 11 §4). Resolves
// how it was unlocked (doc 13 `via`), or null when the ad was closed early.
export async function watchAdFor(
  presenter: RewardedAdPresenter,
  unlockType: RewardedUnlockType = "unlock_mandir_decor",
): Promise<SaveVia | null> {
  try {
    const result = unlockFromOutcome(await presenter.show(unlockType));
    return result.unlocked ? result.via : null;
  } catch {
    return "fallback";
  }
}
export async function watchAdToUnlock(
  presenter: RewardedAdPresenter,
): Promise<boolean> {
  return (await watchAdFor(presenter)) !== null;
}

// The unlocked ids to store after an ad: REWARDED items are kept for good;
// single-use items are not stored.
export function storeUnlock(
  item: Pick<MandirDecor, "id" | "unlock">,
  unlocked: readonly string[],
): string[] {
  if (item.unlock !== "REWARDED" || unlocked.includes(item.id))
    return [...unlocked];
  return [...unlocked, item.id];
}

// ---- Choices ---------------------------------------------------------------

// The saved choice when it still exists and is open, else the first open
// item (else the first item).
export function chosen<T extends { id: string }>(
  items: T[],
  savedId: string | null,
  locked: (item: T) => boolean,
): T | null {
  const saved = savedId ? items.find((item) => item.id === savedId) : undefined;
  if (saved && !locked(saved)) return saved;
  return items.find((item) => !locked(item)) ?? items[0] ?? null;
}

// Swiping onto a temple makes it the saved temple only when it is open; a
// locked temple is just a preview until it is unlocked.
export function templeAfterSwipe(
  savedId: string | null,
  page: { id: string },
  locked: boolean,
): string | null {
  return locked ? savedId : page.id;
}
