/**
 * Employee bottom-navigation routes (pure data — no React, so it is unit
 * testable). Exactly five entries: Главная · Академия · Метрик · База · Рейтинг.
 * "Метрик" is the new central entry (the future Metric AI). "База" is the single
 * Knowledge Hub entry (Scripts + Instructions live under it). Profile is NOT a
 * bottom-nav tab — it is reached from the Home header block.
 */
export interface BottomNavRoute {
  href: string;
  label: string;
  /** Extra path prefixes that keep this tab active. */
  match?: string[];
  /** The raised central action (Метрик) — rendered distinctly. */
  central?: boolean;
}

export const BOTTOM_NAV_ROUTES: BottomNavRoute[] = [
  { href: "/home", label: "Главная" },
  { href: "/academy", label: "Академия" },
  { href: "/metric", label: "Метрик", central: true },
  { href: "/knowledge", label: "База", match: ["/scripts", "/instructions"] },
  { href: "/ranking", label: "Рейтинг" },
];
