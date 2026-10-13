import { z } from "zod";
import { mediaVariantSchema } from "./media";
import {
  BhogKind,
  bhogKinds,
  FlowerKind,
  flowerKinds,
  GarlandKind,
  garlandKinds,
  TrayItem,
  trayItems,
} from "./puja";

// appConfig/visuals (D-057): the images the Prayer, Jaap and Meditation
// screens draw,
// chosen in the admin panel from the asset library and read by the app
// without a release. Every slot is optional; an empty slot keeps the app's
// own drawn art. Per-deity images (the temple with the deity, the jaap
// emblem) live on the deity document instead.

const art = z.object({
  mobile: mediaVariantSchema,
  thumb: mediaVariantSchema.optional(),
});
export type VisualArt = z.infer<typeof art>;

export const sceneSlots = [
  "prayerBackground",
  "jaapBackground",
  "meditationBackground",
  "meditationLamp",
  "toran",
  "divider",
] as const;
export type SceneSlot = (typeof sceneSlots)[number];

export const visualsConfigSchema = z
  .object({
    version: z.number().int().positive(),
    scenes: z.partialRecord(z.enum(sceneSlots), art),
    tray: z.partialRecord(z.enum(trayItems), art),
    flowers: z.partialRecord(z.enum(flowerKinds), art),
    garlands: z.partialRecord(z.enum(garlandKinds), art),
    bhog: z.partialRecord(z.enum(bhogKinds), art),
  })
  .strict();
export type VisualsConfig = z.infer<typeof visualsConfigSchema>;

export const emptyVisualsConfig = (): VisualsConfig => ({
  version: 1,
  scenes: {},
  tray: {},
  flowers: {},
  garlands: {},
  bhog: {},
});

// What the app needs: one asset key per filled slot.
export type Visuals = {
  scenes: Partial<Record<SceneSlot, string>>;
  tray: Partial<Record<TrayItem, string>>;
  flowers: Partial<Record<FlowerKind, string>>;
  garlands: Partial<Record<GarlandKind, string>>;
  bhog: Partial<Record<BhogKind, string>>;
};
export const noVisuals: Visuals = {
  scenes: {},
  tray: {},
  flowers: {},
  garlands: {},
  bhog: {},
};

// Lenient on read: a bad slot is skipped, never the whole screen's art.
const keyOf = (value: unknown) => {
  const parsed = art.safeParse(value);
  return parsed.success ? parsed.data.mobile.key : undefined;
};
function keysOf<K extends string>(
  value: unknown,
  allowed: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!value || typeof value !== "object") return out;
  for (const slot of allowed) {
    const key = keyOf((value as Record<string, unknown>)[slot]);
    if (key) out[slot] = key;
  }
  return out;
}
export function visualsFromDocument(data: unknown): Visuals {
  if (!data || typeof data !== "object") return noVisuals;
  const doc = data as Record<string, unknown>;
  return {
    scenes: keysOf(doc.scenes, sceneSlots),
    tray: keysOf(doc.tray, trayItems),
    flowers: keysOf(doc.flowers, flowerKinds),
    garlands: keysOf(doc.garlands, garlandKinds),
    bhog: keysOf(doc.bhog, bhogKinds),
  };
}
// A deity image field (shrineArt, jaapEmblem), or undefined.
export const deityArtKey = keyOf;
