import type { AppRole } from "@prisma/client";

/**
 * Pure guard predicates for ADMIN user management (no DB / server-only import,
 * so they are unit-testable). The service composes these with DB checks; the
 * server remains the sole authority.
 */

/** True when a role change moves a user out of ADMIN. */
export function isDemotionFromAdmin(currentRole: AppRole, nextRole: AppRole): boolean {
  return currentRole === "ADMIN" && nextRole !== "ADMIN";
}

/** An ADMIN must never demote themselves (self-lockout protection). */
export function isSelfDemotion(
  actorUserId: string,
  targetUserId: string,
  currentRole: AppRole,
  nextRole: AppRole,
): boolean {
  return targetUserId === actorUserId && isDemotionFromAdmin(currentRole, nextRole);
}

/** Demoting the only remaining ADMIN would leave the system with none. */
export function wouldRemoveLastAdmin(demotingFromAdmin: boolean, adminCount: number): boolean {
  return demotingFromAdmin && adminCount <= 1;
}

/** CLUB_MANAGER only works when scoped to a concrete club. */
export function managerMissingClub(nextRole: AppRole, finalClubId: string | null): boolean {
  return nextRole === "CLUB_MANAGER" && !finalClubId;
}
