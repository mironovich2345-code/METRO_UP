import type { NextRequest } from "next/server";
import { requireClubManagerAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubPlan } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/plan?date= — the manager's own club plan for a date.
 *
 * Sprint: REMEDIATION R4, F-05 — gate swapped from requireClubManager
 * (legacy AppRole=CLUB_MANAGER/ADMIN only) to requireClubManagerAccess
 * (legacy OR an active CLUB_MANAGER RoleAssignment grant), matching the
 * sibling control/team/[id]/approve|access routes that already admit
 * grant-only managers. Scope resolution (getClubPlan -> getManagerScope)
 * independently re-verifies the requested clubId against a real active
 * grant before honoring it — this gate change widens WHO may call the
 * route, never WHICH club a request may read.
 */
export async function GET(req: NextRequest) {
  try {
    const manager = await requireClubManagerAccess();
    const date = req.nextUrl.searchParams.get("date") ?? undefined;
    const clubId = req.nextUrl.searchParams.get("clubId");
    return jsonOk(await getClubPlan(manager, date, clubId));
  } catch (e) {
    return handleError(e);
  }
}
