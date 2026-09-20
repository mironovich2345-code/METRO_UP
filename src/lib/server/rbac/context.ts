import "server-only";
import { prisma } from "../db";
import type { CurrentUser } from "../session";
import type { ActorContext } from "./types";

/**
 * Assemble the ActorContext once per request. Pure decision logic lives in
 * ./authorize-core and ./scope-core — this file is the only DB-touching
 * piece of the RBAC foundation.
 */
export async function getActorContext(user: CurrentUser): Promise<ActorContext> {
  const grants = await prisma.roleAssignment.findMany({
    where: { userId: user.id },
    select: { id: true, role: true, scopeType: true, cityId: true, clubId: true, status: true },
  });
  return {
    userId: user.id,
    appRole: user.role,
    accessStatus: user.employeeProfile?.accessStatus ?? null,
    onboardingCompleted: user.employeeProfile?.onboardingCompleted ?? false,
    employeeClubId: user.employeeProfile?.clubId ?? null,
    grants,
  };
}

/** Resolve which city a club belongs to — the DB is the source of truth for
 * City/Club once seeded (see prisma/seed.ts). Returns null for an unknown
 * club id rather than throwing — callers treat "unknown" as "does not
 * satisfy any scope check", never as "everything matches". */
export async function cityIdForClub(clubId: string): Promise<string | null> {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { cityId: true } });
  return club?.cityId ?? null;
}

/**
 * Does this user hold ANY active RoleAssignment, of any role/scope? (Sprint 1
 * / Phase 2B, section 21 — "global vs assignment suspension".)
 *
 * RoleAssignment.status and EmployeeProfile.accessStatus are deliberately
 * separate axes (one specific grant's lifecycle vs. "can this person use the
 * app at all") — revoking one grant must never silently flip the global
 * accessStatus while another active grant remains. This is the ONE place
 * that answers "does anything remain?" — callers (role-assignment-service's
 * revoke/restore) decide what to DO with the answer; this function does not
 * touch accessStatus itself, so the decision logic is never duplicated.
 */
export async function hasAnyActiveWorkingAssignment(userId: string): Promise<boolean> {
  const row = await prisma.roleAssignment.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  });
  return row !== null;
}
