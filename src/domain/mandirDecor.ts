import { Localized } from "../i18n/strings";
import {
  mandirOfferingInputSchema,
  OfferingKind,
  OfferingUnlock,
  TempleStage,
} from "./admin";
import { FlowerKind } from "./puja";

// What the Prayer screen needs from a published mandirOfferings document
// (admin catalogue): temples to swipe through, lights, bells and flowers,
// each free or unlocked with a rewarded ad. The app also bundles a default
// set (same shape, `image` is a bundled source instead of an asset key).
export type DecorItem = {
  id: string;
  kind: OfferingKind;
  name: Localized;
  // Asset key of the image (mobile rendition).
  imageKey: string;
  // Flowers: the traditional kind, for the deity rules.
  flowerKind?: FlowerKind;
  // Bells: asset key of the sound.
  soundKey?: string;
  // Lights: where it hangs (top by default).
  placement?: "top" | "bottom" | "sides";
  // Temples: where the deity stands; a centred default when missing.
  stage?: TempleStage;
  deityIds: string[];
  unlock: OfferingUnlock;
  sortOrder: number;
};

export const defaultStage: TempleStage = {
  x: 0.3,
  y: 0.32,
  width: 0.4,
  height: 0.4,
};

// A stored document also carries bookkeeping (createdAt, updatedAt,
// updatedBy) and Firestore Timestamps for startAt/endAt; the input schema is
// strict, so keep only its fields and turn timestamps into ISO strings.
const inputFields = Object.keys(mandirOfferingInputSchema.shape);
function isoOf(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const stamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof stamp.toDate === "function") return stamp.toDate().toISOString();
    if (typeof stamp.seconds === "number")
      return new Date(stamp.seconds * 1000).toISOString();
  }
  return value;
}
export function storedToInput(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const doc = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of inputFields)
    if (doc[key] !== undefined)
      out[key] =
        key === "startAt" || key === "endAt" ? isoOf(doc[key]) : doc[key];
  return out;
}

// Lenient on read: a document that does not parse, is inactive, has no image
// or is outside its start/end window is skipped, never the whole list.
export function decorFromDocument(
  id: string,
  data: unknown,
  now: Date = new Date(),
): DecorItem | null {
  const parsed = mandirOfferingInputSchema.safeParse(storedToInput(data));
  if (!parsed.success) return null;
  const doc = parsed.data;
  if (!doc.isActive || !doc.art) return null;
  const at = now.toISOString();
  if (doc.startAt && at < doc.startAt) return null;
  if (doc.endAt && at >= doc.endAt) return null;
  return {
    id,
    kind: doc.kind,
    name: doc.name,
    imageKey: doc.art.mobile.key,
    flowerKind: doc.flowerKind,
    soundKey: doc.sound?.audio.key,
    placement: doc.placement,
    stage: doc.stage,
    deityIds: doc.deityIds,
    unlock: doc.unlock,
    sortOrder: doc.sortOrder,
  };
}

// Items of one kind for a deity (empty deityIds: every deity), in order.
export function decorFor(
  items: DecorItem[],
  kind: OfferingKind,
  deityId?: string,
): DecorItem[] {
  return items
    .filter(
      (item) =>
        item.kind === kind &&
        (!item.deityIds.length ||
          (deityId !== undefined && item.deityIds.includes(deityId))),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
