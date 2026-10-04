import { Content } from "../../domain/models";
import { MediaVariant } from "../../domain/media";

// Audio content streams the `stream` variant; ringtones play their `file`
// (doc 22 §A3/§A5). Placeholder catalog items have neither.
export function playableVariant(item: Content): MediaVariant | null {
  return item.media.stream ?? item.media.file ?? null;
}

export const audioTypes: Content["type"][] = [
  "BHAJAN",
  "AARTI",
  "MANTRA",
  "CHALISA",
  "RINGTONE",
];

// Doc 13: content_complete fires once at ≥ 80% of the duration.
export const COMPLETE_FRACTION = 0.8;
export function reachedCompletion(position: number, duration: number) {
  return duration > 0 && position / duration >= COMPLETE_FRACTION;
}

// Keeps seeks inside the track; never seeks to the very end, which would
// immediately finish playback.
export function clampSeek(target: number, duration: number) {
  const end = duration > 0 ? Math.max(0, duration - 0.5) : Infinity;
  return Math.min(Math.max(0, target), end);
}

// Where playback started (doc 13 `source`).
export type PlaySource =
  | "home_rail"
  | "explore"
  | "search"
  | "deity"
  | "collection"
  | "banner"
  | "notification"
  | "mandir"
  | "favorites";
