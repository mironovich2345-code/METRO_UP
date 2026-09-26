import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";
import { getOperationsDirectorDashboard } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/operations-director — network-wide read model.
 * Sprint: role-cabinets, step 4. Reuses the SAME network-read gate as
 * control/network (authorize({action:"network.read"}) — SYSTEM access
 * [legacy ADMIN / active PROJECT_ADMIN grant] OR an active
 * OPERATIONS_DIRECTOR grant). PROJECT_ADMIN may read this model too, exactly
 * like it can already read control/network — no separate check needed.
 *
 * View As is never relevant here: canStartViewAs only lets a CITY_MANAGER
 * start a preview, and only into MANAGER/CLUB_MANAGER/CITY_MANAGER — nobody
 * can preview "as" OPERATIONS_DIRECTOR, and OPERATIONS_DIRECTOR itself can't
 * start a preview at all (no CITY_MANAGER grant to base one on).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!authorize(actor, { action: "network.read" })) {
      throw new AuthError(403, "forbidden", "Доступно только Операционному директору");
    }
    return jsonOk(await getOperationsDirectorDashboard());
  } catch (e) {
    return handleError(e);
  }
}
