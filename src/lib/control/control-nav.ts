import type { AppRole } from "@prisma/client";
import { isSharedControlRole } from "@/lib/roles";

/**
 * The ONE Control navigation model, rendered by both the desktop sidebar and
 * the mobile «Разделы» sheet (ControlShell). Pure, so who-sees-what and route
 * resolution are unit-tested.
 *
 * Sprint: LIVE QA QA-06 / QA-06.1 — Control is the PROJECT_ADMIN / SPM
 * workspace, so their navigation no longer mirrors the club/city cabinets:
 *   - Система (Метрик, Роли, Сотрудники, Логи, Расходы Метрика,
 *     Посещаемость) — PROJECT_ADMIN (system access) ONLY.
 *   - Контент (Обучение, Скрипты, Инструкции) and Контроль и результаты
 *     (Тайный покупатель, Продажи, Рейтинг сотрудников) — the SHARED
 *     PROJECT_ADMIN + SPM surfaces: shown exactly when isSharedControlRole
 *     passes, the same predicate the server guard (requireSharedControlAccess)
 *     uses, so a grant-only PROJECT_ADMIN and a legacy SPM both see them.
 *   - The club cabinet (Управляющий, План дня) is shown to a REAL club
 *     manager only (legacy AppRole=CLUB_MANAGER or an active CLUB_MANAGER
 *     grant) — no longer to a legacy ADMIN merely because canManageClub(ADMIN)
 *     is true. City (Мои клубы) and Сеть keep their grant conditions.
 * No route is removed; every page keeps its own server-side guard, which is
 * what actually authorises access — this list only decides what is offered.
 * QA-07: «Расходы Метрика» and «Посещаемость» join Система (PROJECT_ADMIN
 * only). «Рейтинг клубов» is still NOT listed: no formula/data yet.
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
  | "logs"
  | "costs"
  | "visits"
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
  id: "home" | "system" | "content" | "results" | "club" | "city" | "network";
  /** null = ungrouped (Главная). */
  title: string | null;
  items: ControlNavItem[];
}

export function buildControlNav(flags: ControlNavFlags): ControlNavGroup[] {
  const isAdmin = flags.hasSystemAccess;
  const isSharedControl = isSharedControlRole(flags.role, flags.hasSystemAccess);
  const isRealClubManager = flags.role === "CLUB_MANAGER" || flags.isClubManager;
  const groups: ControlNavGroup[] = [
    { id: "home", title: null, items: [{ href: "/control", label: "Главная", icon: "home", exact: true }] },
  ];
  if (isAdmin) {
    groups.push({
      id: "system",
      title: "Система",
      items: [
        { href: "/control/metric", label: "Метрик", icon: "metric" },
        { href: "/control/roles", label: "Роли", icon: "roles" },
        // Kept (QA-06 audit): the ONLY place to set the legacy role (incl.
        // SPM/ADMIN), move an employee's city/club, change position or
        // access status network-wide — «Роли» covers none of these.
        { href: "/control/users", label: "Сотрудники", icon: "users" },
        { href: "/control/logs", label: "Логи", icon: "logs" },
        // QA-07 — admin-only telemetry (never the shared SPM capability).
        { href: "/control/metric-usage", label: "Расходы Метрика", icon: "costs" },
        { href: "/control/visits", label: "Посещаемость", icon: "visits" },
      ],
    });
  }
  if (isSharedControl) {
    groups.push({
      id: "content",
      title: "Контент",
      items: [
        { href: "/admin/content", label: "Обучение", icon: "learning" },
        { href: "/control/scripts", label: "Скрипты", icon: "scripts" },
        { href: "/control/instructions", label: "Инструкции", icon: "instructions" },
      ],
    });
    groups.push({
      id: "results",
      title: "Контроль и результаты",
      items: [
        { href: "/spm/mystery", label: "Тайный покупатель", icon: "mystery" },
        { href: "/spm/sales", label: "Продажи", icon: "sales" },
        { href: "/spm/rating", label: "Рейтинг сотрудников", icon: "rating" },
      ],
    });
  }
  if (isRealClubManager) {
    groups.push({
      id: "club",
      title: "Клуб",
      items: [
        // «Управляющий» carries the team + access lifecycle; /control/team is
        // its compatibility page (QA-05.1).
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

/** The closed mobile selector: ONLY the current section's name (QA-05.2 —
 * the group lives in the sheet, not here) plus the full accessible name. */
export function describeControlNavSelector(groups: ControlNavGroup[], pathname: string | null | undefined): {
  label: string;
  ariaLabel: string;
} {
  const active = resolveActiveControlNav(groups, pathname);
  if (!active) return { label: "Выберите раздел", ariaLabel: "Открыть разделы" };
  return { label: active.item.label, ariaLabel: `Открыть разделы. Текущий раздел: ${active.item.label}` };
}
