import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getHomeDashboardFor } from "@/lib/server/home";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home — aggregated production dashboard for the current user.
 * Aggregates Daily Plan/XP/rating/mystery — none of which are on the
 * approved LIMITED whitelist — so this requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware via getHomeDashboardFor, which must
 * never call the real getPlanToday() for a preview (write side effect —
 * see home.ts's comment).
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser, isPreviewing } = await resolveEffectiveReadContext(user);
    const data = await getHomeDashboardFor(effectiveUser, isPreviewing);
    return jsonOk(data);
  } catch (e) {
    return handleError(e);
  }
}
