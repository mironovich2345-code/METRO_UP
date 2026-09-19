import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getHomeDashboard } from "@/lib/server/home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home — aggregated production dashboard for the current user.
 * Aggregates Daily Plan/XP/rating/mystery — none of which are on the
 * approved LIMITED whitelist — so this requires FULL access.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const data = await getHomeDashboard(user);
    return jsonOk(data);
  } catch (e) {
    return handleError(e);
  }
}
