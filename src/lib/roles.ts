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

/** /spm + SPM write actions — SPM or ADMIN. */
export function canAccessSpm(role: AppRole): boolean {
  return role === "SPM" || role === "ADMIN";
}
