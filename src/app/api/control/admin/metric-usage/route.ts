import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getMetricUsageSummary } from "@/lib/server/telemetry/admin-analytics";
import { parsePeriodDays } from "@/lib/telemetry/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/control/admin/metric-usage?days=7|30 — Sprint: LIVE QA QA-07.
 * «Расходы Метрика». PROJECT_ADMIN only (requireSystemAccess → SPM,
 * CLUB_MANAGER, CITY_MANAGER, MANAGER get 403). */
export async function GET(req: NextRequest) {
  try {
    await requireSystemAccess();
    return jsonOk(await getMetricUsageSummary(parsePeriodDays(req.nextUrl.searchParams.get("days"))));
  } catch (e) {
    return handleError(e);
  }
}
