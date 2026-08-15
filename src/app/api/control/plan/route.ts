import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubPlan } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/control/plan?date= — the manager's own club plan for a date. */
export async function GET(req: NextRequest) {
  try {
    const manager = await requireClubManager();
    const date = req.nextUrl.searchParams.get("date") ?? undefined;
    const clubId = req.nextUrl.searchParams.get("clubId");
    return jsonOk(await getClubPlan(manager, date, clubId));
  } catch (e) {
    return handleError(e);
  }
}
