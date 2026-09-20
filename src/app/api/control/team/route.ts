import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { canManageClub } from "@/lib/roles";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubTeam, getClubTeamForClub } from "@/lib/server/club-plan";
import { resolveViewContext } from "@/lib/server/rbac/view-as";
import { getActorContext, cityIdForClub } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — team data, in priority order (Sprint 1 / Phase 2B):
 * 1. An active View As preview (MANAGER/CLUB_MANAGER of a specific club) —
 *    the whole point of previewing is to see what that role would see.
 * 2. The legacy path — CLUB_MANAGER/ADMIN reading their own (or, for ADMIN,
 *    an explicitly switched) club. UNCHANGED behavior/response shape.
 * 3. The new RBAC path — a CITY_MANAGER (or OPERATIONS_DIRECTOR/PROJECT_ADMIN
 *    without a legacy AppRole) reading one club within their scope via
 *    authorize({action:"club.read"}). Requires an explicit ?clubId= — there
 *    is no "default club" for a role whose scope spans several clubs.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const clubId = req.nextUrl.searchParams.get("clubId");

    const viewContext = await resolveViewContext(user);
    if (viewContext && viewContext.previewClubId && (viewContext.previewRole === "MANAGER" || viewContext.previewRole === "CLUB_MANAGER")) {
      return jsonOk(await getClubTeamForClub(viewContext.previewClubId));
    }

    if (canManageClub(user.role)) {
      return jsonOk(await getClubTeam(user, clubId));
    }

    if (!clubId) throw new AuthError(400, "club_required");
    const actor = await getActorContext(user);
    const targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId) throw new AuthError(404, "club_not_found");
    if (!authorize(actor, { action: "club.read", targetClubId: clubId, targetClubCityId })) {
      throw new AuthError(403, "forbidden");
    }
    return jsonOk(await getClubTeamForClub(clubId));
  } catch (e) {
    return handleError(e);
  }
}
