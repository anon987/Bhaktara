import { defaultStage } from "../../../domain/mandirDecor";
import type { TempleStage } from "../../../domain/admin";

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
  const max = placement === "top" ? height * 0.36 : height * 0.2;
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
