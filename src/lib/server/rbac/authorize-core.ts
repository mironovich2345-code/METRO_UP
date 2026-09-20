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
 * Canonical (role -> scope shape) rules, checked BEFORE any hierarchy branch
 * in canAssignRole. Without this, the hasSystemAccess() branch below would
 * accept a request like {role: "CITY_MANAGER", scopeType: "NETWORK"} — the
 * role name is right but the scope shape is nonsense — because that branch
 * only ever inspected `target.role`. Centralized here instead of duplicated
 * per branch so a future 6th role/scope can't reintroduce the same gap.
 */
export function isValidGrantShape(target: RoleAssignmentTarget): boolean {
  switch (target.role) {
    case "PROJECT_ADMIN":
      return target.scopeType === "SYSTEM" && target.cityId === null && target.clubId === null;
    case "OPERATIONS_DIRECTOR":
      return target.scopeType === "NETWORK" && target.cityId === null && target.clubId === null;
    case "CITY_MANAGER":
      // CITY (the usual case, dynamic — see RoleScopeType.CITY in schema.prisma)
      // OR CLUB (a point exception/override for one club) — never both set.
      return (
        (target.scopeType === "CITY" && !!target.cityId && !target.clubId) ||
        (target.scopeType === "CLUB" && !!target.clubId && !target.cityId)
      );
    case "CLUB_MANAGER":
    case "MANAGER":
      return target.scopeType === "CLUB" && !!target.clubId && !target.cityId;
  }
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
  if (!isValidGrantShape(target)) return false;

  if (hasSystemAccess(actor)) {
    // PROJECT_ADMIN appoints the two top business tiers only. CITY_MANAGER
    // may be created with either CITY or CLUB scope here (isValidGrantShape
    // already confirmed the shape is one of the two legal ones).
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

/**
 * May `actor` read team/plan data for `targetClubId`? SYSTEM/NETWORK read
 * everything; a CITY_MANAGER or CLUB_MANAGER grant covering the club reads
 * it. Used both by CITY_MANAGER's own direct club reads (control/team) and,
 * transitively, by nothing else yet — View As reads go through the
 * already-validated view context instead (see rbac/view-as.ts), never
 * through this function a second time.
 */
function canReadClub(actor: ActorContext, targetClubId: string, targetClubCityId: string | null): boolean {
  if (hasSystemAccess(actor)) return true;
  const grants = activeGrants(actor);
  if (grants.some((g) => g.role === "OPERATIONS_DIRECTOR")) return true;
  return grants.some(
    (g) => (g.role === "CITY_MANAGER" || g.role === "CLUB_MANAGER") && grantCoversClub(g, targetClubId, targetClubCityId),
  );
}

export interface ViewAsTarget {
  role: "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";
  clubId: string | null;
  cityId: string | null;
}

/**
 * May `actor` START a View As preview shaped like `target`? Sprint 1 / Phase
 * 2B section 12: ONLY an active CITY_MANAGER grant may use View As at all
 * (not PROJECT_ADMIN/OPERATIONS_DIRECTOR — the approved spec scopes this
 * feature to CITY_MANAGER specifically), and only within that same grant's
 * own scope — a CITY_MANAGER can never preview a club/city outside what they
 * could otherwise read or manage for real.
 */
export function canStartViewAs(
  actor: ActorContext,
  target: ViewAsTarget,
  opts: { targetClubCityId?: string | null } = {},
): boolean {
  const cityManagerGrants = activeGrants(actor).filter((g) => g.role === "CITY_MANAGER");
  if (cityManagerGrants.length === 0) return false;
  const targetClubCityId = opts.targetClubCityId ?? null;

  if (target.role === "CITY_MANAGER") {
    // "Preview as myself" — a way to jump back to the top-level view from
    // deeper in the preview flow. Only within a scope this actor actually holds.
    if (target.clubId) return cityManagerGrants.some((g) => grantCoversClub(g, target.clubId!, targetClubCityId));
    if (target.cityId) return cityManagerGrants.some((g) => g.scopeType === "CITY" && g.cityId === target.cityId);
    return true;
  }
  if (target.role === "CLUB_MANAGER" || target.role === "MANAGER") {
    if (!target.clubId) return false;
    return cityManagerGrants.some((g) => grantCoversClub(g, target.clubId!, targetClubCityId));
  }
  return false;
}

export type AuthorizeRequest =
  | { action: "role.assign"; target: RoleAssignmentTarget; targetClubCityId?: string | null }
  | { action: "role.revoke"; target: RoleGrant; targetClubCityId?: string | null }
  | { action: "system.access" }
  | { action: "club.read"; targetClubId: string; targetClubCityId?: string | null }
  | { action: "view_as.start"; target: ViewAsTarget; targetClubCityId?: string | null };

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
    case "club.read":
      return canReadClub(actor, request.targetClubId, request.targetClubCityId ?? null);
    case "view_as.start":
      return canStartViewAs(actor, request.target, { targetClubCityId: request.targetClubCityId });
  }
}
