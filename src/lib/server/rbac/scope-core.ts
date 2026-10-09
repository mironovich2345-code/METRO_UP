import type { ActorContext, NetworkRole, RoleGrant } from "./types";
import type { AcademyTargetRoleDTO } from "@/lib/api/content-types";

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
 * Sprint: role-cabinets, step 4 — does ONE grant cover the given city, either
 * directly (a CITY-scope grant for it) or via a CLUB-scope point-exception
 * grant for one of its clubs? Deliberately BROADER than grantCoversCity
 * alone, which excludes club-scope point exceptions from "covers the whole
 * city" — the correct, narrower semantic for AUTHORIZATION decisions (can
 * this actor act city-wide), but not for this informational "does the city
 * have ANY manager attention at all" question the OPERATIONS_DIRECTOR/
 * CITY_MANAGER cabinets' attention model asks (cabinet-dashboards.ts's
 * CITY_WITHOUT_CITY_MANAGER check — which also needs the filtered grant
 * LIST, not just this boolean, hence exporting both the single-grant
 * predicate and the any-of-many convenience wrapper below).
 */
export function grantCoversCityOrItsClubs(grant: RoleGrant, cityId: string, clubIdsInCity: string[]): boolean {
  return grantCoversCity(grant, cityId) || clubIdsInCity.some((clubId) => grantCoversClub(grant, clubId, cityId));
}

/** True when ANY of the given grants covers the city per
 * grantCoversCityOrItsClubs above. */
export function anyGrantCoversCityOrItsClubs(grants: RoleGrant[], cityId: string, clubIdsInCity: string[]): boolean {
  return grants.some((g) => grantCoversCityOrItsClubs(g, cityId, clubIdsInCity));
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

/**
 * Sprint: manual-test-round-2, section 4 — which Academy tabs a real actor
 * may open at all (never derived from the currently-selected Home context,
 * which only decides the DEFAULT tab — see homeContextToAcademySection in
 * cabinet-ui.ts). Strict hierarchy, exactly matching the approved matrix:
 * MANAGER -> [MANAGER]; CLUB_MANAGER -> [MANAGER, CLUB_MANAGER];
 * CITY_MANAGER -> all three — "higher role may access training of roles
 * below it" means a CITY_MANAGER gets the CLUB_MANAGER tab too even without
 * a SEPARATE, explicit CLUB_MANAGER RoleAssignment of their own (checked
 * top-down, highest grant wins, never additive-per-grant). Pure — takes the
 * already-resolved ActorContext, never queries anything itself — so this
 * lives beside the rest of this file's directly-unit-testable RBAC
 * decisions rather than the DB-touching cabinet-dashboards.ts.
 */
export function resolveAllowedAcademySections(actor: ActorContext): AcademyTargetRoleDTO[] {
  if (hasActiveRole(actor.grants, "CITY_MANAGER")) return ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"];
  if (hasActiveRole(actor.grants, "CLUB_MANAGER")) return ["MANAGER", "CLUB_MANAGER"];
  return ["MANAGER"];
}

/**
 * Management Round E0, section 2 (root cause) — every Academy GET route
 * called `resolveAllowedAcademySections(actor)` against the REAL actor's
 * grants ONLY, with no awareness of an active MANAGER/CLUB_MANAGER persona
 * preview (effective-context.ts's isPersonaPreview). A CITY_MANAGER
 * previewing as CLUB_MANAGER is still, underneath, a real CITY_MANAGER —
 * so the real-actor resolver correctly (for ITS OWN purpose) returned all
 * three sections, and every Academy screen/direct-link check during that
 * preview showed/allowed the CITY_MANAGER's own superset instead of the
 * previewed role's own, narrower set — exactly the live-reported "CLUB_MANAGER
 * Academy shows Менеджер/Управляющий/Ст. города" bug. View As exists
 * specifically so a preview sees what THAT role sees, nothing more.
 *
 * `previewRole` is the SAME narrow persona-substitution union
 * effective-context.ts's isPersonaPreview already gates on (MANAGER |
 * CLUB_MANAGER) — a CITY_MANAGER's own self-preview is NOT persona
 * substitution (isPreviewing stays false for it there), so callers pass
 * `null` for that case and this falls through to the real actor's own
 * grants, correctly unchanged. This does not replace
 * resolveAllowedAcademySections — it is the one extra branch every
 * call site needs, kept as its own function so the real-actor-only
 * resolver (still correct and still used standalone wherever no preview
 * concept applies) is never silently given a signature it doesn't need.
 */
export function resolveAllowedAcademySectionsForPersona(
  actor: ActorContext,
  previewRole: "MANAGER" | "CLUB_MANAGER" | null,
): AcademyTargetRoleDTO[] {
  if (previewRole === "MANAGER") return ["MANAGER"];
  if (previewRole === "CLUB_MANAGER") return ["MANAGER", "CLUB_MANAGER"];
  return resolveAllowedAcademySections(actor);
}

/**
 * Sprint: REMEDIATION R2, F-04 — the one new decision GET /api/control/
 * cabinet/employee-training's fix reduces to: cabinet-dashboards.ts's
 * resolveClubManagerCabinetAccess (reused UNCHANGED — not re-implemented
 * here) may resolve access to SOME club, or none at all; this is the pure
 * equality guard that turns that result into "does the resolved access
 * actually cover THIS target employee's club". The one case this closes: an
 * active View-As CLUB_MANAGER-of-Club-A preview's tier 1 unconditionally
 * resolves to clubId=A, ignoring whatever OTHER club the real actor's
 * broader scope would otherwise read — so a request for an employee in
 * Club B must be denied even though the real actor (a CITY_MANAGER) could
 * read Club B directly outside the preview. Kept as its own pure, DB-free
 * function — resolveClubManagerCabinetAccess itself needs Prisma/cookies
 * and cannot run outside a request, so this is the only part of the fix
 * that can have a real, non-structural test.
 */
export function cabinetAccessCoversClub(access: { clubId: string } | null, targetClubId: string): boolean {
  return access !== null && access.clubId === targetClubId;
}

/**
 * Sprint: REMEDIATION R2.1 — a genuine View-As MANAGER persona preview has
 * NO management Employee Card access at all, even when the REAL actor
 * underneath (a CITY_MANAGER) has legitimate club.read authority over the
 * target's club. Root cause this closes: resolveClubManagerCabinetAccess's
 * tier 1 (the preview-pinning tier) is deliberately CLUB_MANAGER-preview-
 * only — a MANAGER preview never matches it and falls all the way through
 * to the REAL actor's own tiers 2-4, which have no awareness a persona
 * substitution is active at all. Checked by the caller BEFORE calling
 * resolveClubManagerCabinetAccess (its return value alone cannot
 * distinguish "real actor, no preview" from "MANAGER preview that fell
 * through to real authority" — both resolve isPreviewing:false). `false`
 * for a CITY_MANAGER's own self-preview (previewRole:"CITY_MANAGER") and
 * for no preview at all — neither is persona substitution, so real
 * CITY_MANAGER screens (/city, /city/club, ...) are unaffected by this
 * predicate entirely.
 */
export function isManagerPersonaPreview(
  isPreviewing: boolean,
  previewRole: "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER" | null,
): boolean {
  return isPreviewing && previewRole === "MANAGER";
}
