import type { ImageSourcePropType } from "react-native";
import { z } from "zod";
import manifest from "../../../../assets/mandir/manifest.json";
import { mandirOfferingInputSchema } from "../../../domain/admin";
import type { MandirDecor, Murti } from "./decor";

// The mandir decor bundled with the app (assets/mandir, made with Gemini):
// the default temples, lights, bells and flowers, the special offerings
// (D-040) and a murti per deity.
// manifest.json describes them; Metro needs a static require() per file, so
// each manifest path is mapped here. Aspect ratios (width / height) are the
// files' pixel sizes, so the screen can lay them out before they load.

const images: Record<string, { source: ImageSourcePropType; aspect: number }> =
  {
    "temples/marble.webp": {
      source: require("../../../../assets/mandir/temples/marble.webp"),
      aspect: 720 / 1260,
    },
    "temples/wooden.webp": {
      source: require("../../../../assets/mandir/temples/wooden.webp"),
      aspect: 720 / 1260,
    },
    "temples/golden.webp": {
      source: require("../../../../assets/mandir/temples/golden.webp"),
      aspect: 720 / 1260,
    },
    "temples/rajasthani.webp": {
      source: require("../../../../assets/mandir/temples/rajasthani.webp"),
      aspect: 720 / 1260,
    },
    "temples/south.webp": {
      source: require("../../../../assets/mandir/temples/south.webp"),
      aspect: 720 / 1260,
    },
    "temples/himalayan.webp": {
      source: require("../../../../assets/mandir/temples/himalayan.webp"),
      aspect: 720 / 1260,
    },
    "lights/fairy.webp": {
      source: require("../../../../assets/mandir/lights/fairy.webp"),
      aspect: 1080 / 232,
    },
    "lights/diyas.webp": {
      source: require("../../../../assets/mandir/lights/diyas.webp"),
      aspect: 1080 / 132,
    },
    "lights/marigold.webp": {
      source: require("../../../../assets/mandir/lights/marigold.webp"),
      aspect: 1,
    },
    "lights/led.webp": {
      source: require("../../../../assets/mandir/lights/led.webp"),
      aspect: 1080 / 700,
    },
    "lights/kandil.webp": {
      source: require("../../../../assets/mandir/lights/kandil.webp"),
      aspect: 1,
    },
    "lights/jhumar.webp": {
      source: require("../../../../assets/mandir/lights/jhumar.webp"),
      aspect: 1,
    },
    "bells/brass.webp": {
      source: require("../../../../assets/mandir/bells/brass.webp"),
      aspect: 1,
    },
    "bells/big.webp": {
      source: require("../../../../assets/mandir/bells/big.webp"),
      aspect: 1,
    },
    "bells/nandi.webp": {
      source: require("../../../../assets/mandir/bells/nandi.webp"),
      aspect: 1,
    },
    "bells/cluster.webp": {
      source: require("../../../../assets/mandir/bells/cluster.webp"),
      aspect: 1,
    },
    "flowers/genda.webp": {
      source: require("../../../../assets/mandir/flowers/genda.webp"),
      aspect: 1,
    },
    "flowers/rose.webp": {
      source: require("../../../../assets/mandir/flowers/rose.webp"),
      aspect: 1,
    },
    "flowers/jasmine.webp": {
      source: require("../../../../assets/mandir/flowers/jasmine.webp"),
      aspect: 1,
    },
    "flowers/hibiscus.webp": {
      source: require("../../../../assets/mandir/flowers/hibiscus.webp"),
      aspect: 1,
    },
    "flowers/bilva.webp": {
      source: require("../../../../assets/mandir/flowers/bilva.webp"),
      aspect: 1,
    },
    "flowers/tulsi.webp": {
      source: require("../../../../assets/mandir/flowers/tulsi.webp"),
      aspect: 1,
    },
    "flowers/durva.webp": {
      source: require("../../../../assets/mandir/flowers/durva.webp"),
      aspect: 1,
    },
    "flowers/lotus.webp": {
      source: require("../../../../assets/mandir/flowers/lotus.webp"),
      aspect: 1,
    },
    "flowers/champa.webp": {
      source: require("../../../../assets/mandir/flowers/champa.webp"),
      aspect: 1,
    },
    "flowers/dhatura.webp": {
      source: require("../../../../assets/mandir/flowers/dhatura.webp"),
      aspect: 1,
    },
    "flowers/aak.webp": {
      source: require("../../../../assets/mandir/flowers/aak.webp"),
      aspect: 1,
    },
    "flowers/kaner.webp": {
      source: require("../../../../assets/mandir/flowers/kaner.webp"),
      aspect: 1,
    },
    "special/akhand.webp": {
      source: require("../../../../assets/mandir/special/akhand.webp"),
      aspect: 250 / 512,
    },
    "special/chhatra.webp": {
      source: require("../../../../assets/mandir/special/chhatra.webp"),
      aspect: 453 / 512,
    },
    "special/diwali-thali.webp": {
      source: require("../../../../assets/mandir/special/diwali-thali.webp"),
      aspect: 512 / 325,
    },
    "special/garland-genda.webp": {
      source: require("../../../../assets/mandir/special/garland-genda.webp"),
      aspect: 306 / 512,
    },
    "special/garland-jasmine.webp": {
      source: require("../../../../assets/mandir/special/garland-jasmine.webp"),
      aspect: 266 / 512,
    },
    "special/garland-rose.webp": {
      source: require("../../../../assets/mandir/special/garland-rose.webp"),
      aspect: 427 / 512,
    },
    "special/garland-rudraksha.webp": {
      source: require("../../../../assets/mandir/special/garland-rudraksha.webp"),
      aspect: 218 / 512,
    },
    "special/haar.webp": {
      source: require("../../../../assets/mandir/special/haar.webp"),
      aspect: 512 / 412,
    },
    "special/makhan.webp": {
      source: require("../../../../assets/mandir/special/makhan.webp"),
      aspect: 505 / 512,
    },
    "special/modak.webp": {
      source: require("../../../../assets/mandir/special/modak.webp"),
      aspect: 512 / 353,
    },
    "special/morpankh.webp": {
      source: require("../../../../assets/mandir/special/morpankh.webp"),
      aspect: 268 / 512,
    },
    "special/mukut.webp": {
      source: require("../../../../assets/mandir/special/mukut.webp"),
      aspect: 502 / 512,
    },
    "special/panch-diya.webp": {
      source: require("../../../../assets/mandir/special/panch-diya.webp"),
      aspect: 512 / 322,
    },
    "special/shriphal.webp": {
      source: require("../../../../assets/mandir/special/shriphal.webp"),
      aspect: 512 / 462,
    },
    "murti/shiva.webp": {
      source: require("../../../../assets/mandir/murti/shiva.webp"),
      aspect: 574 / 800,
    },
    "murti/krishna.webp": {
      source: require("../../../../assets/mandir/murti/krishna.webp"),
      aspect: 346 / 800,
    },
    "murti/ganesha.webp": {
      source: require("../../../../assets/mandir/murti/ganesha.webp"),
      aspect: 609 / 800,
    },
    "murti/hanuman.webp": {
      source: require("../../../../assets/mandir/murti/hanuman.webp"),
      aspect: 351 / 800,
    },
    "murti/durga.webp": {
      source: require("../../../../assets/mandir/murti/durga.webp"),
      aspect: 556 / 800,
    },
    "murti/vishnu.webp": {
      source: require("../../../../assets/mandir/murti/vishnu.webp"),
      aspect: 338 / 800,
    },
    "murti/lakshmi.webp": {
      source: require("../../../../assets/mandir/murti/lakshmi.webp"),
      aspect: 595 / 800,
    },
    "murti/ram.webp": {
      source: require("../../../../assets/mandir/murti/ram.webp"),
      aspect: 322 / 800,
    },
    "murti/saraswati.webp": {
      source: require("../../../../assets/mandir/murti/saraswati.webp"),
      aspect: 599 / 800,
    },
  };

const sounds: Record<string, number> = {
  "sounds/brass.m4a": require("../../../../assets/mandir/sounds/brass.m4a"),
  "sounds/big.m4a": require("../../../../assets/mandir/sounds/big.m4a"),
  "sounds/nandi.m4a": require("../../../../assets/mandir/sounds/nandi.m4a"),
  "sounds/cluster.m4a": require("../../../../assets/mandir/sounds/cluster.m4a"),
};

// A manifest entry: the admin document's fields, with bundled file paths in
// place of asset keys.
const entrySchema = mandirOfferingInputSchema
  .pick({
    name: true,
    kind: true,
    flowerKind: true,
    offerAt: true,
    placement: true,
    stage: true,
    unlock: true,
    sortOrder: true,
  })
  .extend({
    id: z.string().min(1),
    image: z.string(),
    sound: z.string().optional(),
    deityIds: z.array(z.string()).optional(),
  })
  .strip();

function fromManifest(): MandirDecor[] {
  return manifest.offerings.flatMap((raw): MandirDecor[] => {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) return [];
    const { image, sound, deityIds, ...entry } = parsed.data;
    const file = images[image];
    if (!file) return [];
    const audio = sound ? sounds[sound] : undefined;
    return [
      {
        ...entry,
        deityIds: deityIds ?? [],
        image: file.source,
        aspect: file.aspect,
        ...(audio !== undefined ? { sound: audio } : {}),
      },
    ];
  });
}

export const bundledDecor: MandirDecor[] = fromManifest();

// The bundled murti for a deity id, if there is one.
const murtiPaths: Record<string, { image: string }> = manifest.murti;
export function bundledMurti(deityId: string): Murti | null {
  const path = murtiPaths[deityId]?.image;
  const file = path ? images[path] : undefined;
  return file ? { source: file.source, aspect: file.aspect } : null;
}
