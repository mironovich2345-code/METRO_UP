import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { canManageClub } from "@/lib/roles";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubTeam, getClubTeamForClub } from "@/lib/server/club-plan";
import { resolveViewContext } from "@/lib/server/rbac/view-as";
import { getActorContext, cityIdForClub } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { requireNoManagerPersonaPreview } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — team data, in priority order (Sprint 1 / Phase 2B):
 * 1. An active View As CLUB_MANAGER preview of a specific club — the whole
 *    point of previewing is to see what that role would see.
 * 2. The manager path — legacy AppRole=CLUB_MANAGER/ADMIN OR an active
 *    CLUB_MANAGER RoleAssignment grant, reading via getClubTeam/
 *    getManagerScope (own clubId auto-resolved/unioned, or a re-verified
 *    requestedClubId). UNCHANGED response shape.
 * 3. The new RBAC path — a CITY_MANAGER (or OPERATIONS_DIRECTOR/PROJECT_ADMIN
 *    without a legacy AppRole, and without their own CLUB_MANAGER identity)
 *    reading one club within their scope via authorize({action:"club.read"}).
 *    Requires an explicit ?clubId= — there is no "default club" for a role
 *    whose scope spans several clubs.
 *
 * Sprint: REMEDIATION R2.2 — traced (not assumed) TWO distinct problems for
 * a View-As MANAGER preview: (1) tier 1 above USED TO explicitly include
 * previewRole==="MANAGER" in its condition, returning the full club roster
 * (getClubTeamForClub — the same management data CLUB_MANAGER's /team
 * shows, including every member's daily-plan/lesson progress) to a MANAGER
 * persona outright; (2) even with that removed, a MANAGER preview would
 * fall through to branch 3's authorize({action:"club.read"}) against the
 * REAL actor's own grants, leaking the same roster for any club in the
 * real actor's real scope. requireNoManagerPersonaPreview denies BEFORE
 * any of the three branches run, closing both. A View-As CLUB_MANAGER
 * preview (branch 1) and a real, non-previewing CITY_MANAGER's drill-down
 * (branch 3) are both unaffected.
 *
 * Sprint: REMEDIATION R4.3 — branch 2's gate used to be canManageClub(role)
 * ONLY (legacy AppRole), so a RoleAssignment-only CLUB_MANAGER (no legacy
 * AppRole) fell all the way to branch 3 — no auto-default for a single
 * eligible club, no scope/picker metadata, and a bare 400 "club_required"
 * instead of the same "Выберите клуб" experience control/plan already has.
 * Widened to match requireClubManagerAccess's own admission rule (legacy
 * OR an active CLUB_MANAGER grant) so every CLUB_MANAGER identity reaches
 * getClubTeam/getManagerScope — the SAME resolver control/plan uses, now
 * union-aware across legacy clubId + grant clubs (see club-plan.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    await requireNoManagerPersonaPreview(user);
    const clubId = req.nextUrl.searchParams.get("clubId");

    const viewContext = await resolveViewContext(user);
    if (viewContext && viewContext.previewClubId && viewContext.previewRole === "CLUB_MANAGER") {
      return jsonOk(await getClubTeamForClub(viewContext.previewClubId));
    }

    const actor = await getActorContext(user);
    if (canManageClub(user.role) || hasActiveRole(actor.grants, "CLUB_MANAGER")) {
      return jsonOk(await getClubTeam(user, clubId));
    }

    if (!clubId) throw new AuthError(400, "club_required");
    const targetClubCityId = await cityIdForClub(clubId);
    if (!targetClubCityId) throw new AuthError(404, "club_not_found");
    if (!authorize(actor, { action: "club.read", targetClubId: clubId, targetClubCityId })) {
      throw new AuthError(403, "forbidden");
    }
    return jsonOk(await getClubTeamForClub(clubId));
  } catch (e) {
    return handleError(e);
  }
}
