import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getPlanTodayFor } from "@/lib/server/daily-plan";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plan/today — today's plan; system tasks are generated idempotently.
 * Daily Plan is explicitly named as SUSPENDED-blocked, and is not on the
 * approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware via getPlanTodayFor, which must never
 * materialize DailyTask rows for the synthetic preview persona.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser, isPreviewing } = await resolveEffectiveReadContext(user);
    const plan = await getPlanTodayFor(effectiveUser, isPreviewing);
    return jsonOk(plan);
  } catch (e) {
    return handleError(e);
  }
}
