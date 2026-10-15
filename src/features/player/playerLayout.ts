// The full-screen player fits on one screen: the header, artwork, titles,
// seek bar, notice line and controls are all visible without scrolling
// (only the lyrics sit below the fold). Everything but the artwork has a
// fixed height, so the artwork gets what is left over.

// Fixed heights (dp) of the parts around the artwork. Text heights are
// multiplied by the font scale (capped by PLAYER_MAX_FONT_SCALE).
export const PLAYER_LAYOUT = {
  garland: 34,
  // The 52 dp close button, pulled up 6 dp under the garland.
  header: 46,
  // Side padding of the player page.
  sidePadding: 20,
  artMarginTop: 8,
  artMarginBottom: 10,
  // The gold frame's padding on each side.
  framePadding: 5,
  maxFrameWidth: 440,
  titlesMarginTop: 2,
  titleLine: 34,
  otherTitleLine: 26,
  subtitleMarginTop: 2,
  subtitleLine: 26,
  seekTouch: 56,
  seekTimesMarginTop: -6,
  // The times row (the elapsed time grows to 22 pt while dragging).
  seekTimesLine: 36,
  // One line under the seek bar: loading / error / unavailable, or the
  // "Read the lyrics" link. Always reserved so the art never jumps.
  notice: 44,
  controlsMarginTop: 2,
  playSize: 84,
  bottomPadding: 12,
};
export const PLAYER_MAX_FONT_SCALE = 1.4;
// Smaller than this the artwork stops shrinking (the titles cut to 1 line
// first).
export const MIN_ART_SIZE = 140;

export type PlayerLayoutInput = {
  width: number;
  height: number;
  fontScale?: number;
  insets: { top: number; bottom: number; left: number; right: number };
  // Artwork width ÷ height, 1 to 16:9.
  ratio: number;
};
export type PlayerLayout = {
  // The artwork's size inside the gold frame.
  artWidth: number;
  artHeight: number;
  // How many lines the main title may take.
  titleLines: 1 | 2;
  // The height of everything above the fold, artwork included.
  usedHeight: number;
};

// Everything but the artwork (inside its frame), for a title of
// `titleLines` lines.
export function playerFixedHeight(titleLines: number, fontScale = 1) {
  const f = Math.min(Math.max(fontScale, 1), PLAYER_MAX_FONT_SCALE);
  const p = PLAYER_LAYOUT;
  const titles =
    p.titlesMarginTop +
    titleLines * p.titleLine * f +
    p.otherTitleLine * f +
    p.subtitleMarginTop +
    p.subtitleLine * f;
  const seek =
    p.seekTouch + p.seekTimesMarginTop + Math.max(p.seekTimesLine, 35 * f);
  return Math.ceil(
    p.garland +
      p.header +
      p.artMarginTop +
      p.framePadding * 2 +
      p.artMarginBottom +
      titles +
      seek +
      p.notice +
      p.controlsMarginTop +
      p.playSize +
      p.bottomPadding,
  );
}

// Fits the artwork into the height the other parts leave over and the page
// width. A two-line title is allowed while the art stays at least
// MIN_ART_SIZE tall; otherwise the title cuts to one line. With `fill`
// (lyrics over the art) the frame takes all of that space; without, the
// art keeps its own shape (`ratio`) inside it.
export function computePlayerLayout({
  width,
  height,
  fontScale = 1,
  insets,
  ratio,
  fill = false,
}: PlayerLayoutInput & { fill?: boolean }): PlayerLayout {
  const p = PLAYER_LAYOUT;
  const available = height - insets.top - insets.bottom;
  const maxWidth = Math.max(
    0,
    Math.min(
      width - insets.left - insets.right - p.sidePadding * 2,
      p.maxFrameWidth,
    ) -
      p.framePadding * 2,
  );
  const fit = (titleLines: 1 | 2) => {
    const fixed = playerFixedHeight(titleLines, fontScale);
    const room = Math.floor(available - fixed);
    return { titleLines, fixed, room };
  };
  let chosen = fit(2);
  if (chosen.room < MIN_ART_SIZE) chosen = fit(1);
  if (fill) {
    const artHeight = Math.max(chosen.room, MIN_ART_SIZE);
    return {
      artWidth: Math.floor(maxWidth),
      artHeight,
      titleLines: chosen.titleLines,
      usedHeight: chosen.fixed + artHeight,
    };
  }
  const fitted = Math.floor(Math.min(chosen.room, maxWidth / ratio));
  // Never smaller than the minimum (unless the page itself is narrower).
  const artHeight = Math.max(
    fitted,
    Math.min(MIN_ART_SIZE, Math.floor(maxWidth / ratio)),
  );
  const artWidth = Math.floor(Math.min(maxWidth, artHeight * ratio));
  const shownHeight = Math.round(artWidth / ratio);
  return {
    artWidth,
    artHeight: shownHeight,
    titleLines: chosen.titleLines,
    usedHeight: chosen.fixed + shownHeight,
  };
}
