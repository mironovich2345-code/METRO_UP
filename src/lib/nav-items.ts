/**
 * Employee bottom-navigation routes (pure data — no React, so it is unit
 * testable). Exactly five entries; "База" is the single Knowledge Hub entry
 * (Scripts + Instructions live under it, not as their own tabs).
 */
export interface BottomNavRoute {
  href: string;
  label: string;
  /** Extra path prefixes that keep this tab active. */
  match?: string[];
}

export const BOTTOM_NAV_ROUTES: BottomNavRoute[] = [
  { href: "/home", label: "Главная" },
  { href: "/academy", label: "Академия" },
  { href: "/knowledge", label: "База", match: ["/scripts", "/instructions"] },
  { href: "/ranking", label: "Рейтинг" },
  { href: "/profile", label: "Профиль" },
];
