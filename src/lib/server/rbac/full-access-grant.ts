import "server-only";
import type { AccessStatus } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import type { CurrentUser } from "../session";
import { applyAccessStatusChangeTx, applyPendingApprovalTx } from "../club-plan";
import { getActorContext, resolveCityManagerClubs } from "./context";
import { resolveManagerEligibleClubIds } from "./scope-core";
import { resolveViewContext } from "./view-as";
import {
  canOfferFullAccessGrant,
  classifyFullAccessTarget,
  clubManagerTargetClubIds,
  decideFullAccessGrant,
  type FullAccessGrantDecision,
} from "./full-access-grant-core";

/**
 * Sprint: LIVE QA QA-04, section E — DB side of «Выдать полный доступ».
 * Loads the REAL actor's scope (their own grants; never the View-As persona,
 * never anything from the request) and the target's real role/club/status,
 * then asks the pure decideFullAccessGrant. The write goes through the
 * existing club-plan.ts transitions (applyPendingApprovalTx /
 * applyAccessStatusChangeTx), so there is exactly one way accessStatus moves.
 */

interface LoadedGrantContext {
  decision: FullAccessGrantDecision;
  target: { accessStatus: AccessStatus; clubId: string; cityId: string; kind: ReturnType<typeof classifyFullAccessTarget> };
}

async function loadGrantContext(realUser: CurrentUser, targetUserId: string): Promise<LoadedGrantContext | null> {
  const [actor, viewContext, target] = await Promise.all([
    getActorContext(realUser),
    resolveViewContext(realUser),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        employeeProfile: { select: { accessStatus: true, clubId: true, cityId: true } },
        roleAssignments: { select: { id: true, role: true, scopeType: true, cityId: true, clubId: true, status: true } },
      },
    }),
  ]);
  // accessStatus lives on EmployeeProfile — without one there is nothing to grant.
  if (!target?.employeeProfile) return null;

  const cityClubs = await resolveCityManagerClubs(actor);
  const kind = classifyFullAccessTarget(target.role, target.roleAssignments);
  const decision = decideFullAccessGrant({
    actorUserId: realUser.id,
    actorAccessStatus: realUser.employeeProfile?.accessStatus ?? null,
    viewAsActive: viewContext !== null,
    actorClubManagerClubIds: resolveManagerEligibleClubIds(realUser.role, realUser.employeeProfile?.clubId, actor.grants),
    actorCityManagerClubIds: cityClubs.map((c) => c.id),
    targetUserId: target.id,
    targetKind: kind,
    targetClubId: target.employeeProfile.clubId,
    targetManagedClubIds: clubManagerTargetClubIds(target.employeeProfile.clubId, target.roleAssignments),
    targetAccessStatus: target.employeeProfile.accessStatus,
  });
  return {
    decision,
    target: { accessStatus: target.employeeProfile.accessStatus, clubId: target.employeeProfile.clubId, cityId: target.employeeProfile.cityId, kind },
  };
}

/** Read side for the Employee Card: may THIS actor offer the action now? */
export async function canGrantFullAccess(realUser: CurrentUser, targetUserId: string): Promise<boolean> {
  const ctx = await loadGrantContext(realUser, targetUserId);
  return ctx ? canOfferFullAccessGrant(ctx.decision) : false;
}

/**
 * Grant FULL. PENDING_APPROVAL -> FULL goes through the existing approval
 * transition (an ordinary employee also gets the usual MANAGER/CLUB grant);
 * LIMITED -> FULL through the existing access-status change. Already FULL ->
 * nothing written. Audited (actor, target, before/after, club, city, and
 * which authority — CLUB_MANAGER or CITY_MANAGER — allowed it).
 */
export async function grantFullAccess(
  realUser: CurrentUser,
  targetUserId: string,
): Promise<{ userId: string; accessStatus: AccessStatus; changed: boolean }> {
  const ctx = await loadGrantContext(realUser, targetUserId);
  if (!ctx) throw new AuthError(404, "user_not_found", "Сотрудник не найден");
  const { decision, target } = ctx;
  if (!decision.ok) {
    console.warn(`[full-access-denied] ${JSON.stringify({ actorUserId: realUser.id, code: decision.code })}`);
    throw new AuthError(decision.status, decision.code, "Недостаточно прав для изменения доступа");
  }
  if (decision.alreadyFull) return { userId: targetUserId, accessStatus: "FULL", changed: false };

  const audit = {
    actorUserId: realUser.id,
    targetUserId,
    clubId: target.clubId,
    cityId: target.cityId,
    metadata: { source: "scoped_full_access", via: decision.via, targetKind: target.kind },
  };
  await prisma.$transaction((tx) =>
    target.accessStatus === "PENDING_APPROVAL"
      ? applyPendingApprovalTx(tx, { ...audit, toStatus: "FULL", createManagerGrant: target.kind === "EMPLOYEE" })
      : applyAccessStatusChangeTx(tx, { ...audit, before: target.accessStatus, after: "FULL" }),
  );
  return { userId: targetUserId, accessStatus: "FULL", changed: true };
}
