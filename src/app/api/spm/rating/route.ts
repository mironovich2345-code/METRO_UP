import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getSpmRatingView } from "@/lib/server/rating-view";
import { defaultWorkingPeriod } from "@/lib/server/spm-overview";
import { parsePeriodQuery } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — period status, readiness, and calculated rows for the SPM rating page. */
export async function GET(req: NextRequest) {
  try {
    await requireSPM();
    const { month, year } = parsePeriodQuery(req.nextUrl, defaultWorkingPeriod());
    return jsonOk(await getSpmRatingView(month, year));
  } catch (e) {
    return handleError(e);
  }
}
