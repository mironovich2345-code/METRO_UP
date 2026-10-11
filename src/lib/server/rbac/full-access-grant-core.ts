import type { AccessStatus, AppRole } from "@prisma/client";
import { canUseViewAs } from "../access-status-logic";
import type { RoleGrant } from "./types";

/**
 * Sprint: LIVE QA QA-04, section E — "Выдать полный доступ" by a CLUB_MANAGER
 * or CITY_MANAGER inside their own scope. Pure (no DB), so the whole
 * permission matrix is unit-tested; full-access-grant.ts feeds it real rows.
 *
 * This is NOT a new access model: the only thing it ever writes is the
 * existing EmployeeProfile.accessStatus (to FULL), through the existing
 * club-plan.ts transitions, audited with the existing vocabulary.
 *
 * Who may grant (all scope comes from the actor's REAL grants, never from the
 * request — a forged target id can only ever be checked against it):
 * - CLUB_MANAGER: ordinary employees (incl. MANAGER-level) whose club is one
 *   the actor manages (legacy club + CLUB_MANAGER grants).
 * - CITY_MANAGER: ordinary employees AND CLUB_MANAGERs whose club(s) are all
 *   inside the actor's CITY_MANAGER scope.
 * - PROJECT_ADMIN keeps its existing /control flows; nothing changes there.
 *
 * Never through this action: self, CITY_MANAGER, OPERATIONS_DIRECTOR,
 * PROJECT_ADMIN/legacy ADMIN, SPM (a separate legacy content role), and a
 * CLUB_MANAGER when the actor's authority is only CLUB_MANAGER (no existing
 * product rule lets a club manager grant to another club manager).
 *
 * Source status: PENDING_APPROVAL or LIMITED -> FULL. FULL is already done
 * (no write). SUSPENDED is refused — lifting a suspension stays the separate,
 * explicit restore action.
 */

export type FullAccessTargetKind = "EMPLOYEE" | "CLUB_MANAGER" | "CITY_MANAGER" | "OPERATIONS_DIRECTOR" | "PROJECT_ADMIN" | "OTHER";

/** The target's MOST privileged role decides the kind — a CITY_MANAGER who is
 * also an employee somewhere is still a CITY_MANAGER here. */
export function classifyFullAccessTarget(appRole: AppRole, grants: RoleGrant[]): FullAccessTargetKind {
  const active = grants.filter((g) => g.status === "ACTIVE");
  const has = (role: RoleGrant["role"]) => active.some((g) => g.role === role);
  if (appRole === "ADMIN" || has("PROJECT_ADMIN")) return "PROJECT_ADMIN";
  if (has("OPERATIONS_DIRECTOR")) return "OPERATIONS_DIRECTOR";
  if (has("CITY_MANAGER")) return "CITY_MANAGER";
  if (appRole === "CLUB_MANAGER" || has("CLUB_MANAGER")) return "CLUB_MANAGER";
  if (appRole === "SPM") return "OTHER";
  return "EMPLOYEE";
}

/** Every club a CLUB_MANAGER target is tied to — their EmployeeProfile club
 * (the legacy CLUB_MANAGER's managed club) plus each active CLUB_MANAGER
 * grant's club. A CITY_MANAGER
 * may grant to them only if ALL of these are inside their own scope. */
export function clubManagerTargetClubIds(profileClubId: string, grants: RoleGrant[]): string[] {
  const ids = new Set<string>([profileClubId]);
  for (const g of grants) {
    if (g.role === "CLUB_MANAGER" && g.status === "ACTIVE" && g.clubId) ids.add(g.clubId);
  }
  return [...ids];
}

export interface FullAccessGrantInput {
  actorUserId: string;
  /** The actor's OWN EmployeeProfile.accessStatus (null = no profile, e.g. a
   * network-tier CITY_MANAGER — not a restriction). */
  actorAccessStatus: AccessStatus | null;
  /** True while ANY View As context is active — access mutations are then
   * always refused. */
  viewAsActive: boolean;
  /** Clubs the actor manages as CLUB_MANAGER (resolveManagerEligibleClubIds). */
  actorClubManagerClubIds: string[];
  /** Clubs covered by the actor's CITY_MANAGER grants (resolveCityManagerClubs). */
  actorCityManagerClubIds: string[];
  targetUserId: string;
  targetKind: FullAccessTargetKind;
  /** EmployeeProfile.clubId of the target. */
  targetClubId: string;
  /** For a CLUB_MANAGER target: every club they manage (see above). */
  targetManagedClubIds: string[];
  targetAccessStatus: AccessStatus;
}

export type FullAccessGrantDecision =
  | { ok: true; via: "CLUB_MANAGER" | "CITY_MANAGER"; alreadyFull: boolean }
  | { ok: false; status: 403 | 409; code: FullAccessDenyCode };

export type FullAccessDenyCode =
  | "VIEW_AS_READ_ONLY"
  | "actor_access_restricted"
  | "self_target"
  | "target_role_not_allowed"
  | "target_out_of_scope"
  | "target_suspended";

/**
 * The one decision. Order matters: identity/role/scope are checked BEFORE the
 * target's status, so an out-of-scope caller learns nothing about a foreign
 * employee's access state.
 */
export function decideFullAccessGrant(input: FullAccessGrantInput): FullAccessGrantDecision {
  const deny = (status: 403 | 409, code: FullAccessDenyCode): FullAccessGrantDecision => ({ ok: false, status, code });

  if (input.viewAsActive) return deny(403, "VIEW_AS_READ_ONLY");
  // The actor must themselves be in good standing: no profile (network-tier
  // role) or FULL — the same bar canUseViewAs applies to every FULL-level
  // management action.
  if (!canUseViewAs(input.actorAccessStatus)) return deny(403, "actor_access_restricted");
  if (input.actorUserId === input.targetUserId) return deny(403, "self_target");

  const inCityScope = (clubId: string) => input.actorCityManagerClubIds.includes(clubId);
  const inClubScope = (clubId: string) => input.actorClubManagerClubIds.includes(clubId);

  let via: "CLUB_MANAGER" | "CITY_MANAGER";
  if (input.targetKind === "EMPLOYEE") {
    if (inClubScope(input.targetClubId)) via = "CLUB_MANAGER";
    else if (inCityScope(input.targetClubId)) via = "CITY_MANAGER";
    else return deny(403, "target_out_of_scope");
  } else if (input.targetKind === "CLUB_MANAGER") {
    if (input.actorCityManagerClubIds.length === 0) return deny(403, "target_role_not_allowed");
    const clubs = input.targetManagedClubIds.length > 0 ? input.targetManagedClubIds : [input.targetClubId];
    if (!inCityScope(input.targetClubId) || !clubs.every(inCityScope)) return deny(403, "target_out_of_scope");
    via = "CITY_MANAGER";
  } else {
    return deny(403, "target_role_not_allowed");
  }

  if (input.targetAccessStatus === "SUSPENDED") return deny(409, "target_suspended");
  return { ok: true, via, alreadyFull: input.targetAccessStatus === "FULL" };
}

/** Whether the Employee Card should offer «Выдать полный доступ». */
export function canOfferFullAccessGrant(decision: FullAccessGrantDecision): boolean {
  return decision.ok && !decision.alreadyFull;
}
