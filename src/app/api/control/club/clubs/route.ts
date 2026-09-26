import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext, resolveClubManagerClubs } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/club/clubs — the clubs the caller personally manages
 * (legacy AppRole=CLUB_MANAGER's own EmployeeProfile.clubId, UNION any
 * active CLUB_MANAGER RoleAssignment grants — see
 * resolveClubManagerClubs's doc comment). Sprint: role-cabinets, step 6,
 * section 3 — mirrors control/city/clubs's exact shape/gate for CITY_MANAGER.
 * Zero, one, or several clubs; never assumed to be exactly one.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (user.role !== "CLUB_MANAGER" && !hasActiveRole(actor.grants, "CLUB_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно только Управляющим");
    }
    return jsonOk({ clubs: await resolveClubManagerClubs(user, actor) });
  } catch (e) {
    return handleError(e);
  }
}
