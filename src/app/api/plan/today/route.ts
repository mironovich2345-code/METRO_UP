import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getPlanToday } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/plan/today — today's plan; system tasks are generated idempotently. */
export async function GET() {
  try {
    const user = await requireUser();
    const plan = await getPlanToday(user);
    return jsonOk(plan);
  } catch (e) {
    return handleError(e);
  }
}
