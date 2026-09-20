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

/**
 * accessStatus=LIMITED sees only Академия (the approved LIMITED whitelist —
 * Home/Метрик/База/Рейтинг are FULL-only, see requireFullAccess in authz.ts).
 * Sprint 1 / Phase 2B, section 9: access-aware navigation, not a nav that
 * links to tabs the server will 403 the moment they're opened. Pure — no
 * React import — so it is unit-testable like the rest of this file.
 */
export function visibleBottomNavRoutes(accessStatus: string | null | undefined): BottomNavRoute[] {
  if (accessStatus === "LIMITED") return BOTTOM_NAV_ROUTES.filter((r) => r.href === "/academy");
  return BOTTOM_NAV_ROUTES;
}
