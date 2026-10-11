import type { AppRole } from "@prisma/client";
import { canAccessSpm, canManageClub } from "@/lib/roles";

/**
 * Sprint: LIVE QA QA-05, part C — the ONE Control navigation model, rendered
 * by both the desktop sidebar and the mobile «Разделы» sheet (ControlShell).
 * Pure, so who-sees-what and route resolution are unit-tested.
 *
 * VISIBILITY IS UNCHANGED: every item keeps exactly the condition the old
 * flat list in ControlShell used (system access, legacy canManageClub(role)
 * OR an active CLUB_MANAGER grant, CITY_MANAGER grant, OPERATIONS_DIRECTOR
 * grant, legacy canAccessSpm(role)). The only addition is «Метрик», an
 * existing system-access page that was reachable solely through its Home
 * card; it gets the same system-access condition that page itself enforces.
 * Pages and APIs keep their own server-side guards regardless of this list.
 */

/** QA-05.1 — window event a page dispatches to open the mobile «Разделы»
 * sheet owned by ControlShell (one menu, never a second copy). */
export const CONTROL_OPEN_SECTIONS_EVENT = "metro-up:control-open-sections";

export interface ControlNavFlags {
  role: AppRole;
  hasSystemAccess: boolean;
  isClubManager: boolean;
  isCityManager: boolean;
  isOperationsDirector: boolean;
}

export type ControlNavIcon =
  | "home"
  | "learning"
  | "scripts"
  | "instructions"
  | "metric"
  | "users"
  | "roles"
  | "club"
  | "plan"
  | "team"
  | "city"
  | "network"
  | "sales"
  | "mystery"
  | "rating";

export interface ControlNavItem {
  href: string;
  label: string;
  icon: ControlNavIcon;
  /** Only `/control` itself — every other item also owns its sub-routes. */
  exact?: boolean;
  /** QA-05.1 — older routes that now belong to this section (not listed in
   * the nav themselves), so the current-section label stays right on them. */
  aliases?: string[];
}

export interface ControlNavGroup {
  id: "home" | "content" | "people" | "club" | "city" | "network" | "spm";
  /** null = ungrouped (Главная). */
  title: string | null;
  items: ControlNavItem[];
}

export function buildControlNav(flags: ControlNavFlags): ControlNavGroup[] {
  const isAdmin = flags.hasSystemAccess;
  const managesClub = canManageClub(flags.role) || flags.isClubManager;
  const groups: ControlNavGroup[] = [
    { id: "home", title: null, items: [{ href: "/control", label: "Главная", icon: "home", exact: true }] },
  ];
  if (isAdmin) {
    groups.push({
      id: "content",
      title: "Контент",
      items: [
        { href: "/admin/content", label: "Обучение", icon: "learning" },
        { href: "/control/scripts", label: "Скрипты", icon: "scripts" },
        { href: "/control/instructions", label: "Инструкции", icon: "instructions" },
        { href: "/control/metric", label: "Метрик", icon: "metric" },
      ],
    });
    groups.push({
      id: "people",
      title: "Люди и доступ",
      items: [
        { href: "/control/users", label: "Сотрудники", icon: "users" },
        { href: "/control/roles", label: "Роли", icon: "roles" },
      ],
    });
  }
  if (managesClub) {
    groups.push({
      id: "club",
      title: "Клуб",
      items: [
        // QA-05.1 — «Управляющий» is the club-management surface and now
        // carries the team + access lifecycle; «Команда» (/control/team) is a
        // compatibility page reached from it, no longer a primary item.
        { href: "/control/club", label: "Управляющий", icon: "club", aliases: ["/control/team"] },
        { href: "/control/plan", label: "План дня", icon: "plan" },
      ],
    });
  }
  if (flags.isCityManager) {
    groups.push({ id: "city", title: "Город", items: [{ href: "/control/city", label: "Мои клубы", icon: "city" }] });
  }
  if (flags.isOperationsDirector) {
    groups.push({ id: "network", title: "Сеть", items: [{ href: "/control/network", label: "Сеть", icon: "network" }] });
  }
  if (canAccessSpm(flags.role)) {
    groups.push({
      id: "spm",
      title: "Продажи и рейтинг",
      items: [
        { href: "/spm/sales", label: "Продажи", icon: "sales" },
        { href: "/spm/mystery", label: "Тайный покупатель", icon: "mystery" },
        { href: "/spm/rating", label: "Рейтинг", icon: "rating" },
      ],
    });
  }
  return groups;
}

export function flattenControlNav(groups: ControlNavGroup[]): ControlNavItem[] {
  return groups.flatMap((g) => g.items);
}

/** Is `pathname` this item or one of its sub-routes? Segment-aware, so
 * `/control/cityx` never matches `/control/city`. */
function pathMatches(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function controlNavItemMatches(item: ControlNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathMatches(item.href, pathname) || (item.aliases ?? []).some((a) => pathMatches(a, pathname));
}

/** The longest matching path for this item (its href or an alias), or -1. */
function matchLength(item: ControlNavItem, pathname: string): number {
  if (item.exact) return pathname === item.href ? item.href.length : -1;
  let best = pathMatches(item.href, pathname) ? item.href.length : -1;
  for (const a of item.aliases ?? []) if (pathMatches(a, pathname)) best = Math.max(best, a.length);
  return best;
}

/** The section the admin is in: the MOST specific matching item (longest
 * matching href or alias), so `/control/city/club` is «Мои клубы»,
 * `/control/metric/documents` is «Метрик» and `/control/team` is
 * «Управляющий». null on a page outside the nav (e.g. /admin, /spm overview). */
export function resolveActiveControlNav(
  groups: ControlNavGroup[],
  pathname: string | null | undefined,
): { item: ControlNavItem; group: ControlNavGroup } | null {
  if (!pathname) return null;
  let best: { item: ControlNavItem; group: ControlNavGroup; len: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const len = matchLength(item, pathname);
      if (len >= 0 && (!best || len > best.len)) best = { item, group, len };
    }
  }
  return best ? { item: best.item, group: best.group } : null;
}

export function resolveActiveControlNavItem(groups: ControlNavGroup[], pathname: string | null | undefined): ControlNavItem | null {
  return resolveActiveControlNav(groups, pathname)?.item ?? null;
}

/** QA-05.1 — the mobile selector's text: the current section (strongest),
 * its group as quiet context, and the full accessible name. */
export function describeControlNavSelector(groups: ControlNavGroup[], pathname: string | null | undefined): {
  label: string;
  context: string | null;
  ariaLabel: string;
} {
  const active = resolveActiveControlNav(groups, pathname);
  if (!active) return { label: "Выберите раздел", context: null, ariaLabel: "Открыть разделы" };
  return {
    label: active.item.label,
    context: active.group.title,
    ariaLabel: `Открыть разделы. Текущий раздел: ${active.item.label}`,
  };
}
