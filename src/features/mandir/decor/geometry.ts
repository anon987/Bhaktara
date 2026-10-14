import { defaultStage } from "../../../domain/mandirDecor";
import type { OfferPlace, TempleStage } from "../../../domain/admin";

export type Box = { x: number; y: number; width: number; height: number };

// Temples are painted tall (720 × 1260); used until a CDN image reports its
// own size.
export const TEMPLE_ASPECT = 720 / 1260;
// A murti of unknown size is laid out as a standing figure.
export const MURTI_ASPECT = 0.6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Where a temple image sits in the scene window (width × height): it covers
// the window, zoomed in a little when the sanctum would be small, and framed
// so the sanctum is centred with the deity's feet about four-fifths down
// (room for the offerings at the feet). `stage` is the box in the image
// where the deity stands, as fractions of the image.
export function templeView(
  width: number,
  height: number,
  aspect: number = TEMPLE_ASPECT,
  stage: TempleStage = defaultStage,
): { image: Box; stage: Box } {
  // Pixels per unit of image height.
  let k = Math.max(height, width / aspect);
  const stageHeight = stage.height * k;
  const stageWidth = stage.width * aspect * k;
  let zoom = clamp((0.5 * height) / Math.max(1, stageHeight), 1, 1.5);
  zoom = Math.min(zoom, Math.max(1, (0.8 * width) / Math.max(1, stageWidth)));
  k *= zoom;
  const imageWidth = aspect * k;
  const imageHeight = k;
  const x = clamp(
    width / 2 - (stage.x + stage.width / 2) * imageWidth,
    width - imageWidth,
    0,
  );
  const y = clamp(
    0.8 * height - (stage.y + stage.height) * imageHeight,
    height - imageHeight,
    0,
  );
  return {
    image: { x, y, width: imageWidth, height: imageHeight },
    stage: {
      x: x + stage.x * imageWidth,
      y: y + stage.y * imageHeight,
      width: stage.width * imageWidth,
      height: stage.height * imageHeight,
    },
  };
}

// The murti fitted in the stage box: aspect kept, centred, feet on the box's
// bottom edge.
export function murtiBox(stage: Box, aspect: number = MURTI_ASPECT): Box {
  const width = Math.min(stage.width, stage.height * aspect);
  const height = width / aspect;
  return {
    x: stage.x + (stage.width - width) / 2,
    y: stage.y + stage.height - height,
    width,
    height,
  };
}

// Where a light hangs in the scene window. Top: across the top; bottom:
// along the base; sides: one at each side (the right one mirrored).
export function lightBoxes(
  width: number,
  height: number,
  placement: "top" | "bottom" | "sides" = "top",
  aspect = 1,
  // The top of the murti: a light hung from the top stops above it.
  ceiling?: number,
): Box[] {
  if (placement === "sides") {
    let h = height * 0.42;
    let w = h * aspect;
    if (w > width * 0.22) {
      w = width * 0.22;
      h = w / aspect;
    }
    const y = height * 0.03;
    return [
      { x: 0, y, width: w, height: h },
      { x: width - w, y, width: w, height: h },
    ];
  }
  const max =
    placement === "top"
      ? Math.max(
          height * 0.12,
          Math.min(height * 0.36, (ceiling ?? height) - height * 0.02),
        )
      : height * 0.2;
  let w = width;
  let h = w / aspect;
  if (h > max) {
    h = max;
    w = h * aspect;
  }
  const x = (width - w) / 2;
  return [{ x, y: placement === "top" ? 0 : height - h, width: w, height: h }];
}

// The chosen bell hangs from the top, right of centre, on a short chain.
export function bellBox(
  width: number,
  height: number,
): Box & { chain: number } {
  const size = Math.min(width * 0.17, height * 0.22);
  const chain = height * 0.05;
  return {
    x: width * 0.74 - size / 2,
    y: chain,
    width: size,
    height: size,
    chain,
  };
}

// Where a special offering is placed in the scene (width × height), relative
// to the murti standing there: on the head (a mukut resting on it), round
// the neck (a garland or haar across the upper chest), above the head (a
// chhatra), at the feet, or on the altar in front, beside the lamp (slots
// 0–3: right, left, further right, further left). The picture keeps its
// aspect (width / height) inside its box.
export function offerBox(
  place: OfferPlace,
  murti: Box,
  scene: { width: number; height: number },
  aspect = 1,
  slot = 0,
): Box {
  const fit = (maxWidth: number, maxHeight: number) => {
    let width = maxWidth;
    let height = width / aspect;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspect;
    }
    return { width, height };
  };
  const cx = murti.x + murti.width / 2;
  const feet = murti.y + murti.height;
  const centred = (size: { width: number; height: number }, y: number) => ({
    x: cx - size.width / 2,
    y,
    ...size,
  });
  switch (place) {
    case "head": {
      const size = fit(
        Math.min(murti.width * 0.55, murti.height * 0.2),
        murti.height * 0.16,
      );
      return centred(size, murti.y + murti.height * 0.08 - size.height);
    }
    case "above": {
      const bottom = murti.y + murti.height * 0.03;
      const size = fit(
        Math.min(murti.width * 1.1, murti.height * 0.45),
        Math.max(1, Math.min(murti.height * 0.35, bottom)),
      );
      return centred(size, bottom - size.height);
    }
    case "neck":
      return centred(
        fit(
          Math.min(murti.width * 0.85, murti.height * 0.38),
          murti.height * 0.42,
        ),
        murti.y + murti.height * 0.17,
      );
    case "feet": {
      const size = fit(
        Math.min(murti.width * 0.6, murti.height * 0.3),
        murti.height * 0.14,
      );
      return centred(size, feet - size.height * 0.6);
    }
    case "altar": {
      const room = Math.max(0, scene.height - feet);
      const size = fit(
        Math.max(56, murti.height * 0.3),
        clamp(room * 0.75, 30, murti.height * 0.25),
      );
      const gap = Math.max(size.width * 1.1, murti.height * 0.3);
      const side = slot % 2 === 0 ? 1 : -1;
      const step = Math.floor(slot / 2) + 1;
      return {
        x: clamp(
          cx + side * step * gap - size.width / 2,
          0,
          Math.max(0, scene.width - size.width),
        ),
        y: Math.min(
          scene.height - size.height - 2,
          feet + room * 0.9 - size.height,
        ),
        ...size,
      };
    }
  }
}
