import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubManagerTeam, resolveClubManagerCabinetAccess } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/club-manager/team?clubId=... — the cabinet's team
 * roster (position, accessStatus, onboardingCompleted, Academy progress +
 * latest test result per employee). Sprint: role-cabinets, step 4. A
 * separate endpoint from the dashboard summary above it rather than one
 * bigger combined response — the roster is O(club size) and the summary
 * O(1)-ish; keeping them independently fetchable means a UI can show the
 * summary immediately without waiting on (or re-fetching) the full roster,
 * and vice versa. Same three-tier access/scope resolution as the dashboard
 * route (resolveClubManagerCabinetAccess) — the two can never disagree
 * about who may see which club.
 *
 * Deliberately reuses NEITHER control/team's getClubTeamForClub (it has a
 * Daily-Plan-materialization side effect for every employee — a write this
 * read-only roster must never trigger) NOR its DTO shape (different fields:
 * no planCompleted/planTotal here, Academy progress + latest test instead).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const clubIdParam = req.nextUrl.searchParams.get("clubId");
    const access = await resolveClubManagerCabinetAccess(user, clubIdParam);
    if (!access) {
      if (!clubIdParam) throw new AuthError(400, "club_required");
      throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого клуба");
    }
    return jsonOk(await getClubManagerTeam(access.clubId, access.clubName));
  } catch (e) {
    return handleError(e);
  }
}
