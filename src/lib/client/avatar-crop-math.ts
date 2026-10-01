/**
 * METRO UP ROUND 1, Milestone 1 — pure geometry for AvatarCropSheet's
 * pan/zoom/crop-rect math (no DOM/canvas import), pulled out specifically so
 * this non-trivial coordinate math has real, direct unit test coverage
 * rather than only being exercised indirectly through a component I can't
 * render in this repo's test harness (no jsdom/RTL — see cabinet-ui.test.ts's
 * own note on this).
 *
 * Model: a square `viewport` (CSS px) shows a "cover"-fit image — at zoom=1
 * the image's shorter natural dimension exactly fills the viewport, like
 * CSS `object-fit: cover`. `zoom` (>=1) multiplies that base scale. `pan` is
 * the image's CSS-pixel offset from center, always clamped so the image
 * fully covers the viewport (no gaps at any edge).
 */

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The "cover" scale at zoom=1 — the shorter natural dimension exactly
 * fills the square viewport. */
export function baseScaleFor(natural: Size, viewport: number): number {
  return viewport / Math.min(natural.w, natural.h);
}

/** Clamp a proposed pan so the (zoomed) image never leaves a gap inside the
 * square viewport. When the image's rendered size in an axis is <= the
 * viewport (can't happen at zoom>=1 given "cover" base scale, but kept
 * correct regardless), that axis's pan is forced to 0. */
export function clampPan(pan: Point, natural: Size, viewport: number, zoom: number): Point {
  const effectiveScale = baseScaleFor(natural, viewport) * zoom;
  const renderedW = natural.w * effectiveScale;
  const renderedH = natural.h * effectiveScale;
  const maxX = Math.max(0, (renderedW - viewport) / 2);
  const maxY = Math.max(0, (renderedH - viewport) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

export interface CropRect {
  /** All in NATURAL image pixel coordinates — ready for ctx.drawImage's
   * source rectangle. */
  srcX: number;
  srcY: number;
  srcSize: number;
}

/** The square region of the ORIGINAL (natural-resolution) image that is
 * currently visible inside the viewport, given the current zoom/pan —
 * exactly what should be drawn onto the output canvas. */
export function computeCropRect(natural: Size, viewport: number, zoom: number, pan: Point): CropRect {
  const effectiveScale = baseScaleFor(natural, viewport) * zoom;
  const renderedW = natural.w * effectiveScale;
  const renderedH = natural.h * effectiveScale;

  const localLeft = renderedW / 2 - viewport / 2 - pan.x;
  const localTop = renderedH / 2 - viewport / 2 - pan.y;
  const srcSize = viewport / effectiveScale;

  const srcX = Math.max(0, Math.min(localLeft / effectiveScale, natural.w - srcSize));
  const srcY = Math.max(0, Math.min(localTop / effectiveScale, natural.h - srcSize));

  return { srcX, srcY, srcSize };
}
