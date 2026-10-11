import type { AppRole } from "@prisma/client";

/**
 * Access rules (single-role model — Prisma AppRole is unchanged). ADMIN keeps
 * full /admin access AND gains full /spm access for testing/administration/
 * emergency intervention. SPM has /spm only. No role switching, no multi-role.
 */

/** /admin — administrators only. */
export function canAccessAdmin(role: AppRole): boolean {
  return role === "ADMIN";
}

/** /spm + SPM write actions — SPM or ADMIN. (Intentionally NOT widened to
 * CLUB_MANAGER: general Control access is separate from SPM module permissions.) */
export function canAccessSpm(role: AppRole): boolean {
  return role === "SPM" || role === "ADMIN";
}

/** General entry to the /control portal — ADMIN, SPM or CLUB_MANAGER. Module
 * access is checked separately (canAccessAdmin / canAccessSpm / canManageClub). */
export function canAccessControl(role: AppRole): boolean {
  return role === "ADMIN" || role === "SPM" || role === "CLUB_MANAGER";
}

/** Club daily-plan + team modules — CLUB_MANAGER or ADMIN (emergency/testing). */
export function canManageClub(role: AppRole): boolean {
  return role === "CLUB_MANAGER" || role === "ADMIN";
}

/**
 * Sprint: LIVE QA QA-06.1 — the shared Control workspace of PROJECT_ADMIN and
 * SPM: Обучение, Скрипты, Инструкции, Тайный покупатель, Продажи, Рейтинг
 * сотрудников (and the future Рейтинг клубов). True for system access
 * (an active PROJECT_ADMIN/SYSTEM grant OR legacy AppRole=ADMIN — the
 * canonical hasSystemAccess bridge; ADMIN is also matched directly so the
 * legacy role alone is enough) or legacy AppRole=SPM. Never for a
 * CLUB_MANAGER / CITY_MANAGER / OPERATIONS_DIRECTOR / MANAGER by those roles.
 * Pure and client-safe so the server gate (authorize-core.ts) and the Control
 * navigation (control-nav.ts) cannot disagree.
 */
export function isSharedControlRole(appRole: AppRole, hasSystemAccess: boolean): boolean {
  return hasSystemAccess || appRole === "ADMIN" || appRole === "SPM";
}
