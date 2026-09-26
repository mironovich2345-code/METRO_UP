import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { getCityManagerDashboard } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/city-manager — the caller's own effective
 * CITY_MANAGER scope (dynamic — resolveCityManagerClubs, reused unchanged
 * from control/city/clubs, resolves CITY-scope membership at read time, same
 * as every other CITY_MANAGER read path). Sprint: role-cabinets, step 4.
 *
 * View As doesn't apply to this route: canStartViewAs only lets a
 * CITY_MANAGER preview MANAGER/CLUB_MANAGER (or itself, a no-op for this
 * dashboard) — nobody previews "as" a DIFFERENT city manager's identity, so
 * there is no effective-scope substitution to make here, unlike the
 * club-manager route below.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно только Ст. города");
    }
    return jsonOk(await getCityManagerDashboard(actor));
  } catch (e) {
    return handleError(e);
  }
}
