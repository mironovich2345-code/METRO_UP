import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import type { CurrentUser } from "../session";
import { getActorContext } from "./context";
import { hasSystemAccess, hasNetworkAccess } from "./authorize-core";

/**
 * Scoped UserAuditLog read (Sprint 1 / Phase 2B, section 21). Mirrors
 * role-assignment-service.ts's visibilityFilter (deliberately not factored
 * into one shared function — the two scope a different table with a
 * different "all" precondition: RoleAssignment's SYSTEM/NETWORK branch is
 * hasSystemAccess()-or-OPERATIONS_DIRECTOR-grant checked inline, this one
 * calls the already-exported hasSystemAccess()/hasNetworkAccess(); forcing a
 * shared abstraction across the two would cost more clarity than the ~10
 * duplicated lines are worth — same reasoning as view-as-token.ts vs
 * session-token.ts).
 *
 * PROJECT_ADMIN (system access): everything. OPERATIONS_DIRECTOR: everything
 * (UserAuditLog is inherently business/access events — ContentAuditLog is a
 * SEPARATE table for CMS actions and is not exposed here at all). CITY_MANAGER:
 * events whose clubId/cityId falls inside their scope. CLUB_MANAGER (legacy
 * AppRole): events for their own club (EmployeeProfile.clubId). Nobody else
 * (a plain MANAGER) gets a 403 — see requireAuditAccess.
 */

export interface AuditLogRowDTO {
  id: string;
  actorUserId: string;
  targetUserId: string;
  action: string;
  before: unknown;
  after: unknown;
  clubId: string | null;
  cityId: string | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ListAuditLogFilter {
  actorUserId?: string;
  targetUserId?: string;
  action?: string;
  clubId?: string;
  cityId?: string;
  page?: number;
  limit?: number;
}

export interface ListAuditLogResult {
  rows: AuditLogRowDTO[];
  page: number;
  limit: number;
  total: number;
}

async function resolveScope(user: CurrentUser): Promise<Prisma.UserAuditLogWhereInput | null> {
  const actor = await getActorContext(user);
  if (hasSystemAccess(actor) || hasNetworkAccess(actor)) return {};

  const activeCityManagerGrants = actor.grants.filter((g) => g.role === "CITY_MANAGER" && g.status === "ACTIVE");
  const cityIds = activeCityManagerGrants.filter((g) => g.scopeType === "CITY" && g.cityId).map((g) => g.cityId!);
  const clubIds = activeCityManagerGrants.filter((g) => g.scopeType === "CLUB" && g.clubId).map((g) => g.clubId!);

  // Legacy CLUB_MANAGER (AppRole, not a RoleAssignment) — their own club only.
  if (actor.appRole === "CLUB_MANAGER" && actor.employeeClubId) clubIds.push(actor.employeeClubId);

  // UserAuditLog.clubId/cityId are plain columns, not Prisma relations (see
  // schema.prisma) — a CITY-scoped grant's clubs must be resolved by an
  // explicit query, not a nested relation filter, so a CITY_MANAGER also
  // sees events that only recorded clubId (not cityId) for a club inside
  // their city.
  if (cityIds.length) {
    const clubsInCity = await prisma.club.findMany({ where: { cityId: { in: cityIds } }, select: { id: true } });
    for (const c of clubsInCity) clubIds.push(c.id);
  }

  if (cityIds.length === 0 && clubIds.length === 0) return null;

  const or: Prisma.UserAuditLogWhereInput[] = [];
  if (cityIds.length) or.push({ cityId: { in: cityIds } });
  if (clubIds.length) or.push({ clubId: { in: clubIds } });
  return { OR: or };
}

export async function listAuditLog(user: CurrentUser, filter: ListAuditLogFilter = {}): Promise<ListAuditLogResult> {
  const scope = await resolveScope(user);
  if (scope === null) throw new AuthError(403, "forbidden", "Нет доступа к журналу аудита");

  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));

  // AND the scope restriction with any additional filters — never overwrite
  // it (scope's own `OR` branch, when present, is what actually keeps a
  // CITY_MANAGER/CLUB_MANAGER from seeing events outside their zone; a naive
  // `{ ...scope, actorUserId: x }` merge would silently drop that `OR` the
  // moment any other filter is also set).
  const conditions: Prisma.UserAuditLogWhereInput[] = [scope];
  if (filter.actorUserId) conditions.push({ actorUserId: filter.actorUserId });
  if (filter.targetUserId) conditions.push({ targetUserId: filter.targetUserId });
  if (filter.action) conditions.push({ action: filter.action });
  if (filter.clubId) conditions.push({ clubId: filter.clubId });
  if (filter.cityId) conditions.push({ cityId: filter.cityId });
  const where: Prisma.UserAuditLogWhereInput = conditions.length > 1 ? { AND: conditions } : conditions[0];

  const [rows, total] = await Promise.all([
    prisma.userAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userAuditLog.count({ where }),
  ]);

  return {
    page,
    limit,
    total,
    rows: rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      targetUserId: r.targetUserId,
      action: r.action,
      before: r.before,
      after: r.after,
      clubId: r.clubId,
      cityId: r.cityId,
      reason: r.reason,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
