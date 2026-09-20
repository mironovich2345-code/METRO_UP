import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import type { CurrentUser } from "../session";
import { getActorContext, cityIdForClub, hasAnyActiveWorkingAssignment } from "./context";
import { authorize, canRevokeRole, hasSystemAccess, type RoleAssignmentTarget } from "./authorize-core";
import type { ActorContext, NetworkRole, RoleAssignmentStatus, RoleGrant, RoleScopeType } from "./types";

/**
 * Role Assignment domain service (Sprint 1 / Phase 2B). Every write goes
 * through authorize() — no route inlines its own "if role === ..." check —
 * and every write is audited via UserAuditLog. See src/lib/server/rbac/
 * authorize-core.ts for the hierarchy rules this composes.
 */

export interface RoleAssignmentRowDTO {
  id: string;
  userId: string;
  userDisplayName: string;
  role: NetworkRole;
  scopeType: RoleScopeType;
  cityId: string | null;
  cityName: string | null;
  clubId: string | null;
  clubName: string | null;
  status: RoleAssignmentStatus;
  assignedByUserId: string | null;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
}

const ROW_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  city: { select: { id: true, name: true } },
  club: { select: { id: true, name: true, cityId: true } },
} satisfies Prisma.RoleAssignmentInclude;

type RowWithRelations = Prisma.RoleAssignmentGetPayload<{ include: typeof ROW_INCLUDE }>;

function toRowDTO(row: RowWithRelations): RoleAssignmentRowDTO {
  return {
    id: row.id,
    userId: row.userId,
    userDisplayName: row.user.displayName,
    role: row.role,
    scopeType: row.scopeType,
    cityId: row.cityId,
    cityName: row.city?.name ?? null,
    clubId: row.clubId,
    clubName: row.club?.name ?? null,
    status: row.status,
    assignedByUserId: row.assignedByUserId,
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  };
}

/**
 * What can `actor` see? Mirrors the hierarchy: SYSTEM/NETWORK actors see
 * everything; a CITY-scoped grant sees its city's assignments (CITY-scoped
 * rows for that city, plus every CLUB-scoped row for a club inside it —
 * "including clubs added later", resolved here at read time, never
 * denormalized — see schema.prisma's RoleScopeType.CITY comment); a
 * CLUB-scoped grant sees only that club's assignments. No active grant at
 * all -> sees nothing (caller 403s before calling list()).
 */
async function visibilityFilter(actor: ActorContext): Promise<Prisma.RoleAssignmentWhereInput | null> {
  if (hasSystemAccess(actor) || actor.grants.some((g) => g.role === "OPERATIONS_DIRECTOR" && g.status === "ACTIVE")) {
    return {}; // no restriction
  }
  const active = actor.grants.filter((g) => g.status === "ACTIVE");
  const cityIds = active.filter((g) => g.scopeType === "CITY" && g.cityId).map((g) => g.cityId!);
  const clubIds = active.filter((g) => g.scopeType === "CLUB" && g.clubId).map((g) => g.clubId!);
  if (cityIds.length === 0 && clubIds.length === 0) return null; // nothing visible

  const or: Prisma.RoleAssignmentWhereInput[] = [];
  if (cityIds.length) or.push({ scopeType: "CITY", cityId: { in: cityIds } });
  if (clubIds.length) or.push({ scopeType: "CLUB", clubId: { in: clubIds } });
  if (cityIds.length) or.push({ scopeType: "CLUB", club: { cityId: { in: cityIds } } });
  return { OR: or };
}

export interface ListRoleAssignmentsFilter {
  userId?: string;
  role?: NetworkRole;
  status?: RoleAssignmentStatus;
  cityId?: string;
  clubId?: string;
}

export async function listRoleAssignments(
  actorUser: CurrentUser,
  filter: ListRoleAssignmentsFilter = {},
): Promise<RoleAssignmentRowDTO[]> {
  const actor = await getActorContext(actorUser);
  const scope = await visibilityFilter(actor);
  if (scope === null) throw new AuthError(403, "forbidden", "Нет активных назначений с правом просмотра");

  const where: Prisma.RoleAssignmentWhereInput = { ...scope };
  if (filter.userId) where.userId = filter.userId;
  if (filter.role) where.role = filter.role;
  if (filter.status) where.status = filter.status;
  if (filter.cityId) where.cityId = filter.cityId;
  if (filter.clubId) where.clubId = filter.clubId;

  const rows = await prisma.roleAssignment.findMany({
    where,
    include: ROW_INCLUDE,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toRowDTO);
}

export interface CreateRoleAssignmentInput {
  userId: string;
  role: NetworkRole;
  scopeType: RoleScopeType;
  cityId?: string | null;
  clubId?: string | null;
  reason?: string | null;
}

export async function createRoleAssignment(
  actorUser: CurrentUser,
  input: CreateRoleAssignmentInput,
): Promise<RoleAssignmentRowDTO> {
  const actor = await getActorContext(actorUser);
  const cityId = input.cityId ?? null;
  const clubId = input.clubId ?? null;

  const target = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!target) throw new AuthError(404, "user_not_found");

  let targetClubCityId: string | null = null;
  if (clubId) {
    targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId) throw new AuthError(404, "club_not_found");
  }
  if (cityId) {
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { id: true } });
    if (!city) throw new AuthError(404, "city_not_found");
  }

  const roleTarget: RoleAssignmentTarget = { role: input.role, scopeType: input.scopeType, cityId, clubId };
  if (!authorize(actor, { action: "role.assign", target: roleTarget, targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для этого назначения");
  }

  // Pre-check for a clean 409 (the partial unique index, migration
  // 20260817000000_role_assignment_foundation, is the DB-level backstop —
  // see the P2002 catch below for the race the pre-check can't close).
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId: input.userId, role: input.role, scopeType: input.scopeType, cityId, clubId, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) throw new AuthError(409, "assignment_already_active", "Такое назначение уже активно");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.roleAssignment.create({
        data: {
          userId: input.userId,
          role: input.role,
          scopeType: input.scopeType,
          cityId,
          clubId,
          status: "ACTIVE",
          assignedByUserId: actorUser.id,
          reason: input.reason ?? null,
        },
        include: ROW_INCLUDE,
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: actorUser.id,
          targetUserId: input.userId,
          action: "ROLE_ASSIGNED",
          clubId,
          cityId,
          reason: input.reason ?? null,
          after: { role: input.role, scopeType: input.scopeType, cityId, clubId, status: "ACTIVE" },
        },
      });
      return row;
    });
    return toRowDTO(created);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AuthError(409, "assignment_already_active", "Такое назначение уже активно");
    }
    throw e;
  }
}

async function loadGrantOrThrow(id: string): Promise<RowWithRelations> {
  const row = await prisma.roleAssignment.findUnique({ where: { id }, include: ROW_INCLUDE });
  if (!row) throw new AuthError(404, "assignment_not_found");
  return row;
}

function toRoleGrant(row: RowWithRelations): RoleGrant {
  return { id: row.id, role: row.role, scopeType: row.scopeType, cityId: row.cityId, clubId: row.clubId, status: row.status };
}

export interface RevokeRoleAssignmentInput {
  reason?: string | null;
}

/**
 * Revoke (force-suspend) one RoleAssignment. Never touches
 * EmployeeProfile.accessStatus directly — see hasAnyActiveWorkingAssignment's
 * doc comment — EXCEPT the one deliberate exception below: if this was the
 * target's LAST active assignment of any kind, they now hold zero working
 * authority anywhere, so their base app access is suspended too (audited as
 * its own ACCESS_SUSPENDED entry, distinct from ROLE_REVOKED).
 */
export async function revokeRoleAssignment(
  actorUser: CurrentUser,
  assignmentId: string,
  input: RevokeRoleAssignmentInput = {},
): Promise<RoleAssignmentRowDTO> {
  const actor = await getActorContext(actorUser);
  const row = await loadGrantOrThrow(assignmentId);
  if (row.status !== "ACTIVE") {
    throw new AuthError(409, "assignment_not_active", "Назначение уже неактивно");
  }

  const targetClubCityId = row.clubId ? await cityIdForClub(row.clubId) : null;
  if (!canRevokeRole(actor, toRoleGrant(row), { targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для отзыва этого назначения");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.roleAssignment.update({
      where: { id: assignmentId },
      data: { status: "SUSPENDED", endedAt: new Date() },
      include: ROW_INCLUDE,
    });
    await tx.userAuditLog.create({
      data: {
        actorUserId: actorUser.id,
        targetUserId: row.userId,
        action: "ROLE_REVOKED",
        clubId: row.clubId,
        cityId: row.cityId,
        reason: input.reason ?? null,
        before: { status: "ACTIVE" },
        after: { status: "SUSPENDED", role: row.role, scopeType: row.scopeType },
      },
    });

    const stillWorking = await tx.roleAssignment.findFirst({
      where: { userId: row.userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!stillWorking) {
      const profile = await tx.employeeProfile.findUnique({ where: { userId: row.userId }, select: { accessStatus: true } });
      if (profile && profile.accessStatus !== "SUSPENDED") {
        await tx.employeeProfile.update({ where: { userId: row.userId }, data: { accessStatus: "SUSPENDED" } });
        await tx.userAuditLog.create({
          data: {
            actorUserId: actorUser.id,
            targetUserId: row.userId,
            action: "ACCESS_SUSPENDED",
            clubId: row.clubId,
            cityId: row.cityId,
            reason: "last_active_role_assignment_revoked",
            before: { accessStatus: profile.accessStatus },
            after: { accessStatus: "SUSPENDED" },
          },
        });
      }
    }
    return next;
  });

  return toRowDTO(updated);
}

/**
 * Restore a previously SUSPENDED/ENDED RoleAssignment back to ACTIVE. Uses
 * the SAME hierarchy check as revoke (canRevokeRole) — restoring authority
 * requires exactly the authority that could have taken it away; this is not
 * a new, separate rule. Does NOT touch EmployeeProfile.accessStatus (see
 * revokeRoleAssignment's doc comment) — if a suspend earlier also flipped
 * accessStatus because this was the last working assignment, restoring
 * overall app access remains the manager's explicit, separate action via
 * setEmployeeAccess (control/team/[id]/access) — never inferred here.
 */
export async function restoreRoleAssignment(
  actorUser: CurrentUser,
  assignmentId: string,
  reason?: string | null,
): Promise<RoleAssignmentRowDTO> {
  const actor = await getActorContext(actorUser);
  const row = await loadGrantOrThrow(assignmentId);
  if (row.status === "ACTIVE") throw new AuthError(409, "assignment_already_active");

  const targetClubCityId = row.clubId ? await cityIdForClub(row.clubId) : null;
  if (!canRevokeRole(actor, toRoleGrant(row), { targetClubCityId })) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для восстановления этого назначения");
  }

  // Guard against the exact scenario the partial unique index enforces: don't
  // resurrect a row that would collide with an already-ACTIVE duplicate scope.
  const collision = await prisma.roleAssignment.findFirst({
    where: {
      id: { not: assignmentId },
      userId: row.userId,
      role: row.role,
      scopeType: row.scopeType,
      cityId: row.cityId,
      clubId: row.clubId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (collision) throw new AuthError(409, "duplicate_active_assignment", "У пользователя уже есть активное назначение с этим scope");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.roleAssignment.update({
        where: { id: assignmentId },
        data: { status: "ACTIVE", endedAt: null },
        include: ROW_INCLUDE,
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: actorUser.id,
          targetUserId: row.userId,
          action: "ROLE_RESTORED",
          clubId: row.clubId,
          cityId: row.cityId,
          reason: reason ?? null,
          before: { status: row.status },
          after: { status: "ACTIVE", role: row.role, scopeType: row.scopeType },
        },
      });
      return next;
    });
    return toRowDTO(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AuthError(409, "duplicate_active_assignment", "У пользователя уже есть активное назначение с этим scope");
    }
    throw e;
  }
}

export { hasAnyActiveWorkingAssignment };
