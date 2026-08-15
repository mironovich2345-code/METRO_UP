import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import type { UserUpdateInput, UserFilterInput } from "./user-admin-schemas";
import { isDemotionFromAdmin, isSelfDemotion, wouldRemoveLastAdmin, managerMissingClub } from "./user-admin-logic";
import type {
  AdminUserRowDTO,
  AdminUserDetailDTO,
  AdminUserFacetsDTO,
} from "@/lib/api/knowledge-types";

/**
 * ADMIN-only user management. This is the ONLY place role/club/position get
 * changed through the UI. It reuses the existing AppRole + EmployeeProfile
 * models — no new permission or auth system. Every write is audited and guarded
 * against self-lockout (self-demotion + last-admin).
 */

type UserWithProfile = Prisma.UserGetPayload<{
  include: { employeeProfile: { include: { city: true; club: true } } };
}>;

function toRowDTO(u: UserWithProfile): AdminUserRowDTO {
  const p = u.employeeProfile;
  return {
    id: u.id,
    displayName: u.displayName,
    telegramUsername: u.telegramUsername,
    role: u.role,
    cityId: p?.cityId ?? null,
    cityName: p?.city?.name ?? null,
    clubId: p?.clubId ?? null,
    clubName: p?.club?.name ?? null,
    positionId: p?.positionId ?? null,
    accessStatus: p?.accessStatus ?? null,
    hasProfile: p != null,
  };
}

function toDetailDTO(u: UserWithProfile): AdminUserDetailDTO {
  return {
    ...toRowDTO(u),
    telegramFirstName: u.telegramFirstName,
    telegramLastName: u.telegramLastName,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers(filter: UserFilterInput): Promise<AdminUserRowDTO[]> {
  const where: Prisma.UserWhereInput = {};
  if (filter.role) where.role = filter.role;
  const profileWhere: Prisma.EmployeeProfileWhereInput = {};
  if (filter.cityId) profileWhere.cityId = filter.cityId;
  if (filter.clubId) profileWhere.clubId = filter.clubId;
  if (filter.positionId) profileWhere.positionId = filter.positionId;
  if (Object.keys(profileWhere).length) where.employeeProfile = profileWhere;
  if (filter.q) {
    where.OR = [
      { displayName: { contains: filter.q, mode: "insensitive" } },
      { telegramUsername: { contains: filter.q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ displayName: "asc" }],
    include: { employeeProfile: { include: { city: true, club: true } } },
    take: 500,
  });
  return rows.map(toRowDTO);
}

export async function getUser(id: string): Promise<AdminUserDetailDTO> {
  const u = await prisma.user.findUnique({
    where: { id },
    include: { employeeProfile: { include: { city: true, club: true } } },
  });
  if (!u) throw new AuthError(404, "user_not_found");
  return toDetailDTO(u);
}

export async function getUserFacets(): Promise<AdminUserFacetsDTO> {
  const [cities, clubs] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.club.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, cityId: true } }),
  ]);
  return { cities, clubs };
}

/**
 * Apply an ADMIN change to a user. `actorUserId` comes ONLY from the verified
 * session (the route passes it) — never from the request body.
 */
export async function updateUser(
  actorUserId: string,
  targetUserId: string,
  input: UserUpdateInput,
): Promise<AdminUserDetailDTO> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { employeeProfile: true },
  });
  if (!target) throw new AuthError(404, "user_not_found");

  const nextRole = input.role ?? target.role;
  const demotingFromAdmin = isDemotionFromAdmin(target.role, nextRole);

  // Guard 1 — an ADMIN cannot demote themselves (lockout protection).
  if (isSelfDemotion(actorUserId, targetUserId, target.role, nextRole)) {
    throw new AuthError(403, "self_demotion_forbidden", "Нельзя снять роль администратора с самого себя");
  }
  // Guard 2 — never leave the system with zero admins.
  if (demotingFromAdmin) {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (wouldRemoveLastAdmin(demotingFromAdmin, admins)) {
      throw new AuthError(409, "last_admin", "Нельзя убрать последнего администратора");
    }
  }

  // Profile-scoped changes require an existing (onboarded) profile.
  const profileChange =
    input.positionId !== undefined ||
    input.cityId !== undefined ||
    input.clubId !== undefined ||
    input.accessStatus !== undefined;
  if (profileChange && !target.employeeProfile) {
    throw new AuthError(409, "profile_required", "У пользователя ещё нет профиля сотрудника");
  }

  // Resolve + validate city/club against the existing model.
  const profile = target.employeeProfile;
  let finalCityId = input.cityId ?? profile?.cityId ?? null;
  const finalClubId = input.clubId ?? profile?.clubId ?? null;

  if (input.clubId !== undefined) {
    const club = await prisma.club.findUnique({ where: { id: input.clubId } });
    if (!club) throw new AuthError(404, "club_not_found");
    if (input.cityId !== undefined && club.cityId !== input.cityId) {
      throw new AuthError(400, "club_city_mismatch", "Клуб не относится к выбранному городу");
    }
    finalCityId = club.cityId; // authoritative
  } else if (input.cityId !== undefined && profile?.clubId) {
    const club = await prisma.club.findUnique({ where: { id: profile.clubId } });
    if (club && club.cityId !== input.cityId) {
      throw new AuthError(400, "club_required", "Смена города требует выбора клуба этого города");
    }
  }

  // CLUB_MANAGER needs a concrete club to scope their portal to.
  if (managerMissingClub(nextRole, finalClubId)) {
    throw new AuthError(409, "club_required_for_manager", "Назначьте клуб перед ролью управляющего");
  }

  const before = {
    role: target.role,
    positionId: profile?.positionId ?? null,
    cityId: profile?.cityId ?? null,
    clubId: profile?.clubId ?? null,
    accessStatus: profile?.accessStatus ?? null,
  };

  await prisma.$transaction(async (tx) => {
    if (input.role !== undefined && input.role !== target.role) {
      await tx.user.update({ where: { id: targetUserId }, data: { role: input.role } });
    }
    if (profileChange && profile) {
      const data: Prisma.EmployeeProfileUpdateInput = {};
      if (input.positionId !== undefined) data.positionId = input.positionId;
      if (input.accessStatus !== undefined) data.accessStatus = input.accessStatus;
      if (input.clubId !== undefined) {
        data.club = { connect: { id: finalClubId! } };
        data.city = { connect: { id: finalCityId! } };
      } else if (input.cityId !== undefined) {
        data.city = { connect: { id: input.cityId } };
      }
      await tx.employeeProfile.update({ where: { userId: targetUserId }, data });
    }
    const after = {
      role: nextRole,
      positionId: input.positionId ?? before.positionId,
      cityId: input.clubId !== undefined ? finalCityId : input.cityId ?? before.cityId,
      clubId: input.clubId ?? before.clubId,
      accessStatus: input.accessStatus ?? before.accessStatus,
    };
    await tx.userAuditLog.create({
      data: {
        actorUserId,
        targetUserId,
        action: "USER_UPDATE",
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  });

  return getUser(targetUserId);
}
