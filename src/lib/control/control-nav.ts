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
        { href: "/control/club", label: "Управляющий", icon: "club" },
        { href: "/control/plan", label: "План дня", icon: "plan" },
        { href: "/control/team", label: "Команда", icon: "team" },
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
export function controlNavItemMatches(item: ControlNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The section the admin is in: the MOST specific matching item (longest
 * href), so `/control/city/club` is «Мои клубы» and `/control/metric/documents`
 * is «Метрик». null on a page outside the nav (e.g. /admin, /spm overview). */
export function resolveActiveControlNavItem(groups: ControlNavGroup[], pathname: string | null | undefined): ControlNavItem | null {
  if (!pathname) return null;
  let best: ControlNavItem | null = null;
  for (const item of flattenControlNav(groups)) {
    if (controlNavItemMatches(item, pathname) && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}
