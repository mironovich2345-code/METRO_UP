import type { NextRequest } from "next/server";
import { requireSPMAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getSpmOverview, defaultWorkingPeriod } from "@/lib/server/spm-overview";
import { parsePeriodQuery } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSPMAccess();
    const { month, year } = parsePeriodQuery(req.nextUrl, defaultWorkingPeriod());
    return jsonOk(await getSpmOverview(month, year));
  } catch (e) {
    return handleError(e);
  }
}
