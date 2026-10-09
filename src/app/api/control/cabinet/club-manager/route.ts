import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubManagerDashboard, resolveClubManagerCabinetAccess } from "@/lib/server/rbac/cabinet-dashboards";
import { requireNoManagerPersonaPreview } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/club-manager?clubId=... — one club's management
 * read model. Sprint: role-cabinets, step 4. `clubId` is required UNLESS an
 * active View-As CLUB_MANAGER preview supplies it implicitly (see
 * resolveClubManagerCabinetAccess's doc comment for the full three-tier
 * access/scope resolution — the same function backs the /team sibling
 * route below, so the two can never disagree about who may see what).
 *
 * Sprint: REMEDIATION R2.2 — traced (not assumed) that a View-As MANAGER
 * preview reached this cabinet via the exact same tier-4 fallthrough R2.1
 * found in Employee Card: resolveClubManagerCabinetAccess's tier 1 is
 * CLUB_MANAGER-preview-only, so a MANAGER preview fell through to tier 4
 * (club.read, the REAL actor's own grants) — a CITY_MANAGER previewing
 * MANAGER of a club inside their own real scope got that club's full
 * management dashboard. requireNoManagerPersonaPreview denies this BEFORE
 * resolveClubManagerCabinetAccess ever runs — its return value alone
 * cannot distinguish a fallen-through MANAGER preview from no preview at
 * all. A View-As CLUB_MANAGER preview (tier 1) and a real, non-previewing
 * CITY_MANAGER's drill-down (tier 4) are both unaffected.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    await requireNoManagerPersonaPreview(user);
    const clubIdParam = req.nextUrl.searchParams.get("clubId");
    const access = await resolveClubManagerCabinetAccess(user, clubIdParam);
    if (!access) {
      if (!clubIdParam) throw new AuthError(400, "club_required");
      // Sprint: manual-test-round-3, section 10 — safe observability, same
      // convention as the /team sibling route. Management Round E0, section
      // 1 — userRole/hasEmployeeProfileClub added (both non-PII: an AppRole
      // enum value and a boolean) so a denial can be told apart at a glance
      // between "no legacy identity for this club" vs. "something else" —
      // temporary diagnostics for the live P0 trace, safe to keep.
      console.warn(
        `[club-dashboard-access-denied] ${JSON.stringify({
          actorUserId: user.id,
          clubId: clubIdParam,
          userRole: user.role,
          hasEmployeeProfileClub: Boolean(user.employeeProfile?.clubId),
        })}`,
      );
      throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого клуба");
    }
    return jsonOk(await getClubManagerDashboard(access.clubId, access.clubName, access.effectiveUser, access.isPreviewing));
  } catch (e) {
    return handleError(e);
  }
}
