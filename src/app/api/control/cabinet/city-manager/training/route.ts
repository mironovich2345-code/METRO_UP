import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { getCityManagerTrainingByClub } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/city-manager/training — Sprint: manual-test-
 * round-3, section 5A. Club-level training rows for the REAL actor's
 * effective CITY_MANAGER scope only (getCityManagerTrainingByClub, which
 * itself calls resolveCityManagerClubs — the same dynamic-resolution +
 * dedup logic every other CITY_MANAGER read already uses). CITY_MANAGER-only
 * — a MANAGER/CLUB_MANAGER with no CITY_MANAGER grant gets 403, never a
 * silently-empty list that could be mistaken for "no clubs".
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно только Ст. города");
    }
    return jsonOk({ clubs: await getCityManagerTrainingByClub(actor) });
  } catch (e) {
    return handleError(e);
  }
}
