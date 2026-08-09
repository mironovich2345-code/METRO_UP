import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { RANKING_POSITIONS } from "./rating-formula";
import { getPositionById } from "@/content/positions";
import type { SpmEmployeeDTO } from "@/lib/api/spm-types";

/**
 * Real ranking-eligible employees: role EMPLOYEE + valid EmployeeProfile in a
 * ranking position (CLIENT_MANAGER, NIGHT_MANAGER). ADMINISTRATOR is excluded.
 * Never exposes telegramId/username.
 */
export interface EmployeeFilter {
  cityId?: string;
  clubId?: string;
  search?: string;
}

export function rankingEmployeeWhere(filter?: EmployeeFilter): Prisma.UserWhereInput {
  return {
    role: "EMPLOYEE",
    employeeProfile: {
      positionId: { in: RANKING_POSITIONS },
      ...(filter?.cityId ? { cityId: filter.cityId } : {}),
      ...(filter?.clubId ? { clubId: filter.clubId } : {}),
    },
    ...(filter?.search
      ? { displayName: { contains: filter.search, mode: "insensitive" as const } }
      : {}),
  };
}

export async function getRankingEmployees(filter?: EmployeeFilter): Promise<SpmEmployeeDTO[]> {
  const users = await prisma.user.findMany({
    where: rankingEmployeeWhere(filter),
    orderBy: { displayName: "asc" },
    include: { employeeProfile: { include: { club: true, city: true } } },
  });
  return users.map(toEmployeeDTO);
}

export function toEmployeeDTO(u: {
  id: string;
  displayName: string;
  employeeProfile: {
    positionId: string;
    city: { name: string } | null;
    club: { name: string } | null;
    cityId: string;
    clubId: string;
  } | null;
}): SpmEmployeeDTO {
  const p = u.employeeProfile;
  return {
    employeeUserId: u.id,
    displayName: u.displayName,
    positionTitle: p ? getPositionById(p.positionId)?.title ?? null : null,
    cityId: p?.cityId ?? null,
    cityName: p?.city?.name ?? null,
    clubId: p?.clubId ?? null,
    clubName: p?.club?.name ?? null,
  };
}
