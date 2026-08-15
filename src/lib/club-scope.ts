import type { AppRole } from "@prisma/client";
import { canAccessAdmin } from "./roles";

/**
 * Pure club-scope rules (no server-only / DB import, so unit-testable). The DB
 * validation lives in the service; these decide *whose* club is used:
 * - Only ADMIN may switch club scope.
 * - CLUB_MANAGER is always locked to their own EmployeeProfile.clubId — a
 *   client-supplied clubId is ignored entirely (never trusted).
 */
export function canSwitchClub(role: AppRole): boolean {
  return canAccessAdmin(role);
}

/**
 * The clubId to honor from a client request: the requested one only for ADMIN,
 * otherwise null (→ the caller falls back to the actor's own club).
 */
export function requestedClubForRole(role: AppRole, requestedClubId?: string | null): string | null {
  return canSwitchClub(role) ? requestedClubId ?? null : null;
}
