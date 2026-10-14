import type { TempleStage } from "../../../../src/domain/admin";

// Geometry for the temple stage editor: where the deity stands in a temple
// image, as fractions of its width and height (src/domain/admin.ts
// templeStageSchema). Pure, so it is unit tested without a browser.

export type StageHandle = "move" | "nw" | "ne" | "sw" | "se";
// Smallest box the editor lets a drag make (5 % of the image).
export const MIN_STAGE = 0.05;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// Four decimals are plenty (0.01 % of the image) and keep documents tidy.
const round = (value: number) => Math.round(value * 10000) / 10000;

export function roundStage(stage: TempleStage): TempleStage {
  return { x: round(stage.x), y: round(stage.y), width: round(stage.width), height: round(stage.height) };
}

// Keeps a box inside the image and at least MIN_STAGE in each direction.
export function clampStage(stage: TempleStage): TempleStage {
  const width = clamp(stage.width, MIN_STAGE, 1);
  const height = clamp(stage.height, MIN_STAGE, 1);
  return roundStage({
    x: clamp(stage.x, 0, 1 - width),
    y: clamp(stage.y, 0, 1 - height),
    width,
    height,
  });
}

// The box after dragging `handle` by (dx, dy), in fractions of the image.
// Moving keeps the size; a corner moves only its own two edges.
export function dragStage(start: TempleStage, handle: StageHandle, dx: number, dy: number): TempleStage {
  if (handle === "move")
    return roundStage({
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    });
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle === "nw" || handle === "sw") left = clamp(left + dx, 0, right - MIN_STAGE);
  else right = clamp(right + dx, left + MIN_STAGE, 1);
  if (handle === "nw" || handle === "ne") top = clamp(top + dy, 0, bottom - MIN_STAGE);
  else bottom = clamp(bottom + dy, top + MIN_STAGE, 1);
  return roundStage({ x: left, y: top, width: right - left, height: bottom - top });
}

// Percent strings for absolutely positioning the box over the image.
export const stageStyle = (stage: TempleStage) => ({
  left: `${stage.x * 100}%`,
  top: `${stage.y * 100}%`,
  width: `${stage.width * 100}%`,
  height: `${stage.height * 100}%`,
});
