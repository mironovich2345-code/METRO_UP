import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getCityManagerDelegatedTasks } from "@/lib/server/city-plan";
import { getActorContext, cityIdForClub } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/city-manager/delegated-tasks?clubId=... —
 * Management Round E2.1. The gap Round E2's compact summary left: the
 * actual DailyTask rows THIS CITY_MANAGER personally assigned to the
 * club's active CLUB_MANAGER (text/date/completion), including
 * future-dated ones. Identical auth shape to club-task-status's own
 * route, deliberately — same role check, same scope re-validation over
 * this exact club, same "club not in scope -> 403" failure mode. clubId
 * is the only client input; the target manager is always resolved
 * server-side (city-plan.ts's resolveActiveClubManagerForClub), never a
 * client-supplied userId. A GET, so it is never touched by the View-As
 * mutation guard in src/middleware.ts — correct, since this is read-only
 * and View-As preview must still be able to read it.
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

    return jsonOk(await getCityManagerDelegatedTasks(user.id, clubId));
  } catch (e) {
    return handleError(e);
  }
}
