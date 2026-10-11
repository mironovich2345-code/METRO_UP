/**
 * Sprint: LIVE QA QA-04, section C — the toggle switch's geometry, derived
 * rather than hand-tuned. Pure, so the arithmetic is unit-tested.
 *
 * Root cause of the iPhone bug this replaces: the old thumb was
 * `position:absolute` with NO `left`, so its horizontal position was its
 * STATIC position inside a <button> — and a button centres its content
 * (UA `text-align: center`), so the thumb started at the track's centre
 * (24px in a 48px track). `translate-x-5` (20px) then pushed it to 44–68px,
 * 20px outside the track. The fix pins the thumb to an explicit inset and
 * moves it by exactly the free travel inside the track.
 */
export interface SwitchGeometry {
  trackWidth: number;
  trackHeight: number;
  thumbSize: number;
  /** Gap between the thumb and the track edge — equal on every side. */
  inset: number;
  /** How far the thumb moves from OFF to ON: the track's free width. */
  travel: number;
}

export function switchGeometry(trackWidth = 48, trackHeight = 28, thumbSize = 24): SwitchGeometry {
  const inset = (trackHeight - thumbSize) / 2;
  const travel = trackWidth - thumbSize - inset * 2;
  return { trackWidth, trackHeight, thumbSize, inset, travel };
}

/** The thumb's left edge, relative to the track, in each state. */
export function switchThumbLeft(geometry: SwitchGeometry, checked: boolean): number {
  return geometry.inset + (checked ? geometry.travel : 0);
}
