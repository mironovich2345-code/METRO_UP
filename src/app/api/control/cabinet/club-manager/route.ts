import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubManagerDashboard, resolveClubManagerCabinetAccess } from "@/lib/server/rbac/cabinet-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/club-manager?clubId=... — one club's management
 * read model. Sprint: role-cabinets, step 4. `clubId` is required UNLESS an
 * active View-As CLUB_MANAGER preview supplies it implicitly (see
 * resolveClubManagerCabinetAccess's doc comment for the full three-tier
 * access/scope resolution — the same function backs the /team sibling
 * route below, so the two can never disagree about who may see what).
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
    return jsonOk(await getClubManagerDashboard(access.clubId, access.clubName, access.effectiveUser, access.isPreviewing));
  } catch (e) {
    return handleError(e);
  }
}
