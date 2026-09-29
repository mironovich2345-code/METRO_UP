import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getEmployeeTrainingDetail } from "@/lib/server/academy";
import { getActorContext, cityIdForClub } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/employee-training?userId=... — Sprint:
 * manual-test-round-3, sections 5C/5D. ONE role-agnostic endpoint reused by
 * BOTH CITY_MANAGER (clubs -> employees -> this detail) and CLUB_MANAGER
 * (employees -> this detail directly) — no parallel analytics system per
 * role. Authorization: resolve the TARGET employee's own club, then the
 * existing club.read authority decides — the exact same predicate
 * (canReadClub, authorize-core.ts) that already scopes /team and the
 * club-manager cabinet routes to "a CITY_MANAGER/CLUB_MANAGER grant covering
 * this club, or network-wide access" — never a new, parallel scope rule. A
 * plain MANAGER (no such grant) is rejected the same way it already is
 * everywhere else in this file.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const targetUserId = req.nextUrl.searchParams.get("userId");
    if (!targetUserId) return jsonError(400, "user_required");

    const target = await prisma.employeeProfile.findUnique({
      where: { userId: targetUserId },
      select: { clubId: true },
    });
    if (!target) return jsonError(404, "user_not_found");

    const actor = await getActorContext(user);
    const targetClubCityId = await cityIdForClub(target.clubId);
    if (!authorize(actor, { action: "club.read", targetClubId: target.clubId, targetClubCityId })) {
      // Sprint: manual-test-round-3, section 10 — safe observability.
      console.warn(`[employee-training-denied] ${JSON.stringify({ actorUserId: user.id, targetClubId: target.clubId })}`);
      throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого сотрудника");
    }

    return jsonOk(await getEmployeeTrainingDetail(targetUserId));
  } catch (e) {
    return handleError(e);
  }
}
