import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getVisitSummary } from "@/lib/server/telemetry/admin-analytics";
import { parsePeriodDays } from "@/lib/telemetry/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOME_LIMIT = 5;
const PAGE_LIMIT = 20;

/** GET /api/control/admin/visits?days=7|30&limit=5 — Sprint: LIVE QA QA-07.
 * «Посещаемость» — aggregate only (no per-user history). PROJECT_ADMIN only. */
export async function GET(req: NextRequest) {
  try {
    await requireSystemAccess();
    const sp = req.nextUrl.searchParams;
    const limit = sp.get("limit") === String(HOME_LIMIT) ? HOME_LIMIT : PAGE_LIMIT;
    return jsonOk(await getVisitSummary(parsePeriodDays(sp.get("days")), limit));
  } catch (e) {
    return handleError(e);
  }
}
