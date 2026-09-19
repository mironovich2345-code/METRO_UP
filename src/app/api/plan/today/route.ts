import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getPlanToday } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plan/today — today's plan; system tasks are generated idempotently.
 * Daily Plan is explicitly named as SUSPENDED-blocked, and is not on the
 * approved LIMITED whitelist — requires FULL access.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const plan = await getPlanToday(user);
    return jsonOk(plan);
  } catch (e) {
    return handleError(e);
  }
}
