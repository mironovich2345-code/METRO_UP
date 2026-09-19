import { grantCoversClub } from "./scope-core";
import type { ActorContext, NetworkRole, RoleGrant, RoleScopeType } from "./types";

/**
 * Pure hierarchical authorization rules (no DB / server-only import, so this
 * whole module is directly unit-testable). `authorize()` is the single named
 * entry point every caller uses — nothing outside this file encodes "who can
 * assign/revoke whom".
 *
 * LEGACY COMPATIBILITY (Sprint 1 Phase 2A): AppRole is the LEGACY
 * authorization axis (see src/lib/server/authz.ts) and is never extended with
 * new business rules here — the ONE bridge is hasSystemAccess(), which lets
 * an existing AppRole=ADMIN account act as PROJECT_ADMIN until the backfill
 * (prisma/backfill-role-assignments.ts) has run, without duplicating a
 * requireAdmin()-style check on every route.
 */

/** AppRole=ADMIN (legacy) OR an active PROJECT_ADMIN/SYSTEM grant. */
export function hasSystemAccess(actor: ActorContext): boolean {
  if (actor.appRole === "ADMIN") return true;
  return actor.grants.some(
    (g) => g.role === "PROJECT_ADMIN" && g.scopeType === "SYSTEM" && g.status === "ACTIVE",
  );
}

function activeGrants(actor: ActorContext): RoleGrant[] {
  return actor.grants.filter((g) => g.status === "ACTIVE");
}

export interface RoleAssignmentTarget {
  role: NetworkRole;
  scopeType: RoleScopeType;
  cityId: string | null;
  clubId: string | null;
}

/**
 * May `actor` create a RoleAssignment shaped like `target`? Structured so
 * that self-promotion and scope-jumping are impossible BY CONSTRUCTION, not
 * by a special-cased check: an actor who is not a PROJECT_ADMIN simply has no
 * branch that can produce OPERATIONS_DIRECTOR/CITY_MANAGER/PROJECT_ADMIN.
 */
export function canAssignRole(
  actor: ActorContext,
  target: RoleAssignmentTarget,
  opts: { targetClubCityId?: string | null } = {},
): boolean {
  if (hasSystemAccess(actor)) {
    // PROJECT_ADMIN appoints the two top business tiers only.
    return target.role === "OPERATIONS_DIRECTOR" || target.role === "CITY_MANAGER";
  }

  const grants = activeGrants(actor);
  const targetClubCityId = opts.targetClubCityId ?? null;

  if (target.role === "CLUB_MANAGER") {
    if (target.scopeType !== "CLUB" || !target.clubId) return false;
    return grants.some((g) => g.role === "CITY_MANAGER" && grantCoversClub(g, target.clubId!, targetClubCityId));
  }

  if (target.role === "MANAGER") {
    if (target.scopeType !== "CLUB" || !target.clubId) return false;
    return grants.some(
      (g) =>
        (g.role === "CITY_MANAGER" || g.role === "CLUB_MANAGER") &&
        grantCoversClub(g, target.clubId!, targetClubCityId),
    );
  }

  // OPERATIONS_DIRECTOR / CITY_MANAGER / PROJECT_ADMIN assignment: PROJECT_ADMIN-only (above).
  return false;
}

/**
 * May `actor` revoke (end/suspend) the given existing grant? Mirrors the
 * hierarchy in canAssignRole but is intentionally a separate function — "who
 * can create X" and "who can undo X" are not always symmetric (e.g. a
 * CLUB_MANAGER never assigns a fellow CLUB_MANAGER, but per the approved
 * spec only CITY_MANAGER/OPERATIONS_DIRECTOR/PROJECT_ADMIN may revoke one —
 * collapsing both into one function would obscure that this is a deliberate
 * design decision, not an oversight).
 */
export function canRevokeRole(
  actor: ActorContext,
  target: RoleGrant,
  opts: { targetClubCityId?: string | null } = {},
): boolean {
  if (hasSystemAccess(actor)) return true; // PROJECT_ADMIN: any assignment.

  const grants = activeGrants(actor);
  const targetClubCityId = opts.targetClubCityId ?? null;
  const targetClubId = target.scopeType === "CLUB" ? target.clubId : null;

  if (grants.some((g) => g.role === "OPERATIONS_DIRECTOR")) {
    // NETWORK scope: any business user, except PROJECT_ADMIN.
    return target.role !== "PROJECT_ADMIN";
  }

  if (target.role === "CLUB_MANAGER") {
    if (!targetClubId) return false;
    return grants.some((g) => g.role === "CITY_MANAGER" && grantCoversClub(g, targetClubId, targetClubCityId));
  }

  if (target.role === "MANAGER") {
    if (!targetClubId) return false;
    return grants.some(
      (g) =>
        (g.role === "CITY_MANAGER" && grantCoversClub(g, targetClubId, targetClubCityId)) ||
        (g.role === "CLUB_MANAGER" && g.clubId === targetClubId),
    );
  }

  // Nobody below PROJECT_ADMIN/OPERATIONS_DIRECTOR may revoke an
  // OPERATIONS_DIRECTOR/CITY_MANAGER/PROJECT_ADMIN grant.
  return false;
}

export type AuthorizeRequest =
  | { action: "role.assign"; target: RoleAssignmentTarget; targetClubCityId?: string | null }
  | { action: "role.revoke"; target: RoleGrant; targetClubCityId?: string | null }
  | { action: "system.access" };

/**
 * The single entry point every caller uses — routes/services never inline
 * their own "if role === ..." checks for RBAC decisions (see Sprint 1 plan,
 * section 16). Add new `action` variants here, not ad hoc checks elsewhere.
 */
export function authorize(actor: ActorContext, request: AuthorizeRequest): boolean {
  switch (request.action) {
    case "role.assign":
      return canAssignRole(actor, request.target, { targetClubCityId: request.targetClubCityId });
    case "role.revoke":
      return canRevokeRole(actor, request.target, { targetClubCityId: request.targetClubCityId });
    case "system.access":
      return hasSystemAccess(actor);
  }
}
