/**
 * Sprint: LIVE QA QA-05.2 — how much room a root tab screen must leave at its
 * bottom so its LAST piece of content can scroll completely above the
 * floating BottomNavigation. One rule for every screen that renders the nav.
 *
 * Root cause of "the last employee card hides under the nav": every root
 * screen used a hard-coded `pb-32` (128px) that ignored
 * `env(safe-area-inset-bottom)`, while the nav itself sits safe-area + 12px
 * above the bottom edge and its raised «Метрик» button pokes ~19–24px above
 * the bar. On an iPhone (34px home-indicator inset) the nav's visual top is
 * ≈ 34 + 12 + 66 + 19 ≈ 131px — above the 128px of padding, so content ended
 * underneath the raised button with no gap.
 *
 * The geometry below mirrors bottom-navigation.tsx (the nav's visual height
 * is NOT changed by this fix).
 */
export const BOTTOM_NAV_GEOMETRY = {
  /** `pb-[calc(env(safe-area-inset-bottom)+12px)]` on the fixed <nav>. */
  offsetAboveSafeArea: 12,
  /** Bar: py-2 (16) + item py-1.5 (12) + 22px icon + 4px gap + 10px label + 2px border. */
  barHeight: 66,
  /** The raised «Метрик» circle (-mt-8, size-14) and its glow above the bar's top edge. */
  raisedOverhang: 24,
  /** Breathing room between the last content and the nav. */
  visualGap: 16,
} as const;

/** Pixels needed above the safe-area inset. */
export function bottomNavClearancePx(g: typeof BOTTOM_NAV_GEOMETRY = BOTTOM_NAV_GEOMETRY): number {
  return g.offsetAboveSafeArea + g.barHeight + g.raisedOverhang + g.visualGap;
}

/**
 * The class every root tab screen's outer wrapper uses. Written out literally
 * (Tailwind only generates classes it can see in source); tests assert it
 * equals `env(safe-area-inset-bottom) + bottomNavClearancePx()`.
 */
export const BOTTOM_NAV_CLEARANCE_CLASS = "pb-[calc(env(safe-area-inset-bottom)+118px)]";
