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

export interface ClubSummary {
  id: string;
  name: string;
  cityId: string;
  cityName: string | null;
}

/**
 * Resolve the concrete list of clubs a CITY_MANAGER's active grants cover
 * (Sprint 1 / Phase 2B, "Мои клубы" — control/city). A CITY-scoped grant
 * expands to every active club currently in that city (dynamic, matches
 * RoleScopeType.CITY's schema.prisma contract — "including clubs added
 * later"); a CLUB-scoped grant (the point-exception case) resolves to just
 * that one club. De-duplicated by club id in case of overlapping grants.
 */
export async function resolveCityManagerClubs(actor: ActorContext): Promise<ClubSummary[]> {
  const grants = actor.grants.filter((g) => g.role === "CITY_MANAGER" && g.status === "ACTIVE");
  const cityIds = grants.filter((g) => g.scopeType === "CITY" && g.cityId).map((g) => g.cityId!);
  const clubIds = grants.filter((g) => g.scopeType === "CLUB" && g.clubId).map((g) => g.clubId!);

  const byId = new Map<string, ClubSummary>();
  if (cityIds.length) {
    const clubs = await prisma.club.findMany({
      where: { cityId: { in: cityIds }, isActive: true },
      include: { city: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    for (const c of clubs) byId.set(c.id, { id: c.id, name: c.name, cityId: c.cityId, cityName: c.city?.name ?? null });
  }
  if (clubIds.length) {
    const clubs = await prisma.club.findMany({
      where: { id: { in: clubIds } },
      include: { city: { select: { name: true } } },
    });
    for (const c of clubs) byId.set(c.id, { id: c.id, name: c.name, cityId: c.cityId, cityName: c.city?.name ?? null });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export interface NetworkCitySummary {
  id: string;
  name: string;
  clubs: { id: string; name: string; employeeCount: number }[];
}

/** Sprint 1 / Phase 2B, section 20 — OPERATIONS_DIRECTOR's minimal network
 * read-path: cities -> clubs -> employee count. No deeper analytics by
 * design ("не делать пока сложную аналитику"). */
export async function resolveNetworkTree(): Promise<NetworkCitySummary[]> {
  const [cities, counts] = await Promise.all([
    prisma.city.findMany({
      where: { isActive: true },
      include: { clubs: { where: { isActive: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.employeeProfile.groupBy({ by: ["clubId"], _count: { _all: true } }),
  ]);
  const countByClub = new Map(counts.map((c) => [c.clubId, c._count._all]));
  return cities.map((city) => ({
    id: city.id,
    name: city.name,
    clubs: city.clubs.map((club) => ({ id: club.id, name: club.name, employeeCount: countByClub.get(club.id) ?? 0 })),
  }));
}
