import type { NetworkRole, RoleGrant } from "./types";

/**
 * Pure RoleAssignment scope resolution (no DB / server-only import, so it is
 * directly unit-testable). Resolving "does club X belong to city Y" is a DB
 * concern (see ./context.ts) — every function here takes the already-resolved
 * city id as a plain argument, never looks it up itself.
 */

/** Only ACTIVE grants are ever exercisable — PENDING_APPROVAL/SUSPENDED/ENDED
 * never authorize anything, by construction (not by a caller remembering to
 * filter). */
export function isGrantActive(grant: Pick<RoleGrant, "status">): boolean {
  return grant.status === "ACTIVE";
}

/**
 * Does one grant's scope cover the given target club? `targetClubCityId` is
 * the target club's OWN city (resolved by the caller from the DB) — this is
 * the one check that stops a CITY_MANAGER scoped to city A from being
 * honored for a club that actually belongs to city B.
 */
export function grantCoversClub(
  grant: RoleGrant,
  targetClubId: string,
  targetClubCityId: string | null,
): boolean {
  if (!isGrantActive(grant)) return false;
  switch (grant.scopeType) {
    case "SYSTEM":
    case "NETWORK":
      return true;
    case "CITY":
      return grant.cityId !== null && grant.cityId === targetClubCityId;
    case "CLUB":
      return grant.clubId === targetClubId;
    default:
      return false;
  }
}

/** Does one grant's scope cover the given target CITY as a whole (e.g. a
 * city-level dashboard, not one specific club within it)? A CLUB-scoped
 * grant never covers "the whole city", even if it happens to be the only
 * club in that city today — narrowing must be explicit. */
export function grantCoversCity(grant: RoleGrant, targetCityId: string): boolean {
  if (!isGrantActive(grant)) return false;
  switch (grant.scopeType) {
    case "SYSTEM":
    case "NETWORK":
      return true;
    case "CITY":
      return grant.cityId === targetCityId;
    case "CLUB":
      return false;
  }
}

/** True when ANY of the actor's grants for `role` covers the target club. */
export function anyGrantCoversClub(
  grants: RoleGrant[],
  role: NetworkRole,
  targetClubId: string,
  targetClubCityId: string | null,
): boolean {
  return grants.some((g) => g.role === role && grantCoversClub(g, targetClubId, targetClubCityId));
}

/** True when the actor holds at least one ACTIVE grant for `role`, anywhere. */
export function hasActiveRole(grants: RoleGrant[], role: NetworkRole): boolean {
  return grants.some((g) => g.role === role && isGrantActive(g));
}

/**
 * Sprint: role-cabinets, section 4 — hard business cap, system-wide: at most
 * this many ACTIVE OPERATIONS_DIRECTOR RoleAssignment rows may exist at once
 * (ENDED/SUSPENDED rows never count — see isGrantActive). This is the pure
 * decision the DB-touching side (role-assignment-service.ts's
 * assertOperationsDirectorCapacity) enforces race-safely via a Postgres
 * advisory lock; kept here, separate and directly unit-testable, so the
 * BUSINESS number itself (currently 2) is never duplicated or drifted
 * between the two.
 */
export const OPERATIONS_DIRECTOR_MAX_ACTIVE = 2;

/** Is there room for one more ACTIVE OPERATIONS_DIRECTOR, given the current
 * count (system-wide, excluding whichever row — if any — is about to become
 * ACTIVE)? */
export function hasOperationsDirectorCapacity(currentActiveCount: number): boolean {
  return currentActiveCount < OPERATIONS_DIRECTOR_MAX_ACTIVE;
}
