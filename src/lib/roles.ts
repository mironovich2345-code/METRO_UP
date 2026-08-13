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
