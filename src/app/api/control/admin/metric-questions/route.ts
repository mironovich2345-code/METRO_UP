import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getFrequentMetricQuestions } from "@/lib/server/telemetry/admin-analytics";
import { parsePeriodDays } from "@/lib/telemetry/retention";
import { FREQUENT_QUESTIONS_HOME_LIMIT, FREQUENT_QUESTIONS_PAGE_LIMIT } from "@/lib/telemetry/frequent-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/control/admin/metric-questions?days=7|30&limit=5|10 — Sprint:
 * LIVE QA QA-07. «Частые вопросы Метрику» — RAW employee prompt text, so
 * PROJECT_ADMIN only (requireSystemAccess). Never the shared SPM capability. */
export async function GET(req: NextRequest) {
  try {
    await requireSystemAccess();
    const sp = req.nextUrl.searchParams;
    const limit = sp.get("limit") === String(FREQUENT_QUESTIONS_HOME_LIMIT) ? FREQUENT_QUESTIONS_HOME_LIMIT : FREQUENT_QUESTIONS_PAGE_LIMIT;
    return jsonOk(await getFrequentMetricQuestions(parsePeriodDays(sp.get("days")), limit));
  } catch (e) {
    return handleError(e);
  }
}
