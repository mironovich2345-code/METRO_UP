import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext, resolveCityManagerClubs } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/control/city/clubs — the CITY_MANAGER's own clubs (Sprint 1 / Phase 2B). */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно только Ст. города");
    }
    return jsonOk({ clubs: await resolveCityManagerClubs(actor) });
  } catch (e) {
    return handleError(e);
  }
}
