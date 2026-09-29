import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveProfileManagementRoles } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profile/management-roles — Sprint: manual-test-round-3, section 4.
 * A separate, lazily-fetched endpoint (not folded into /api/auth/me, which
 * is on the app's bootstrap-critical path and is called far more often than
 * Profile is opened) — reuses resolveProfileManagementRoles, which reuses
 * resolveCityManagerClubs/resolveClubManagerClubs UNCHANGED. Server-scoped:
 * always the REAL session user's own current grants (requireUser +
 * getActorContext), never a client-supplied role/scope. A plain MANAGER
 * (neither grant) gets an empty array.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    const roles = await resolveProfileManagementRoles(user, actor);
    return jsonOk({ roles });
  } catch (e) {
    return handleError(e);
  }
}
