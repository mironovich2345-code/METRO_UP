import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getClubManagerTaskStatus } from "@/lib/server/city-plan";
import { getActorContext, cityIdForClub } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/city-manager/club-task-status?clubId=... —
 * Management Round E2, section 11. Compact status for /city/club's
 * "Задачи" row: the club's active CLUB_MANAGER (if any — either identity
 * source, same union as the assignment flow) and their own "today"
 * DailyTask total/completed counts. Same scope re-validation as the
 * assignment endpoint (club.read over this exact club) — this is a GET,
 * so it is never blocked by the View-As mutation guard, correctly: a
 * CITY_MANAGER should still be able to READ this summary.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно только Ст. города");
    }
    const clubId = req.nextUrl.searchParams.get("clubId");
    if (!clubId) return jsonError(400, "club_required");

    const targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId || !authorize(actor, { action: "club.read", targetClubId: clubId, targetClubCityId })) {
      throw new AuthError(403, "forbidden", "Клуб не входит в вашу зону ответственности");
    }

    return jsonOk(await getClubManagerTaskStatus(clubId));
  } catch (e) {
    return handleError(e);
  }
}
