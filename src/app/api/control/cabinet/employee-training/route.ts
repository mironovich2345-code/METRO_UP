import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getManagementEmployeeCard } from "@/lib/server/rbac/employee-card";
import { resolveClubManagerCabinetAccess } from "@/lib/server/rbac/cabinet-dashboards";
import { cabinetAccessCoversClub, isManagerPersonaPreview } from "@/lib/server/rbac/scope-core";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/employee-training?userId=... — Sprint:
 * manual-test-round-3, sections 5C/5D. ONE role-agnostic endpoint reused by
 * BOTH CITY_MANAGER (clubs -> employees -> this detail) and CLUB_MANAGER
 * (employees -> this detail directly) — no parallel analytics system per
 * role. Authorization: resolve the TARGET employee's own club, then ask
 * resolveClubManagerCabinetAccess "may this actor act on THIS club" and
 * confirm the answer actually covers it (cabinetAccessCoversClub) — never a
 * new, parallel scope rule. A plain MANAGER (no grant/preview at all) is
 * rejected the same way it already is everywhere else in this file.
 *
 * Management Round E1 — the response is now the fuller
 * ManagementEmployeeCardDTO (profile/employment/learning/tests/mystery
 * shopper), composed by getManagementEmployeeCard; the URL and the route
 * name are UNCHANGED from Round E0 — this is still the one endpoint behind
 * /team/employee, never a second role-specific one (section 3's explicit
 * "do not create duplicate role-specific employee pages").
 *
 * Sprint: REMEDIATION R2, F-04 — authorization now goes through
 * resolveClubManagerCabinetAccess (cabinet-dashboards.ts), the SAME 4-tier
 * "which club may this actor act on" resolver /control/cabinet's
 * dashboard/team routes already use, rather than this route's own parallel
 * club.read + legacy-club check. That parallel check never consulted an
 * active View-As CLUB_MANAGER preview at all: a CITY_MANAGER previewing as
 * CLUB_MANAGER of Club A could still open an employee's card in Club B,
 * because their own REAL, broader scope still satisfied club.read directly —
 * the real actor's wider authority was leaking through a persona-substituted
 * read. resolveClubManagerCabinetAccess's tier 1 pins an active CLUB_MANAGER
 * preview to EXACTLY the previewed club (ignores the requested club
 * entirely), so cabinetAccessCoversClub (scope-core.ts — pure, directly
 * unit-tested) now rejects the cross-club read. A real (non-previewing)
 * CITY_MANAGER is UNCHANGED: tier 4 still grants every club their real scope
 * covers — this must NOT become CLUB_MANAGER-only for them. Legacy
 * AppRole=CLUB_MANAGER (tier 2) and a real CLUB_MANAGER RoleAssignment grant
 * (tier 3) are also unchanged, just now resolved by the shared helper
 * instead of a second, divergent inline copy of the same rule.
 *
 * Sprint: REMEDIATION R2.1 — traced (not assumed from a comment) that a
 * View-As MANAGER preview, unlike CLUB_MANAGER, does NOT stop at
 * resolveClubManagerCabinetAccess's tier 1 (deliberately CLUB_MANAGER-
 * preview-only — see that function's own doc comment) and instead fell
 * ALL THE WAY THROUGH to tier 4 (club.read), which checks the REAL actor's
 * own grants with zero awareness a persona substitution is even active. A
 * CITY_MANAGER with real scope covering Club A + Club B, previewing as
 * MANAGER of Club A, could therefore still open EITHER club's Employee
 * Card — tier 4 resolves access for both, since both are in the real
 * actor's real scope. A genuine MANAGER persona has no management
 * Employee Card access at all, so this is checked explicitly, BEFORE
 * resolveClubManagerCabinetAccess runs: isManagerPersonaPreview
 * (scope-core.ts, pure) denies unconditionally when a genuine MANAGER
 * preview is active. resolveClubManagerCabinetAccess's return value alone
 * cannot distinguish this case from "no preview at all" (both resolve
 * isPreviewing:false), so the check cannot live downstream of it. A
 * CITY_MANAGER's own self-preview (previewRole:"CITY_MANAGER") never sets
 * isPreviewing (effective-context.ts's isPersonaPreview excludes it), so
 * real CITY_MANAGER screens (/city, /city/club, /city/managers,
 * /city/training) are completely unaffected by this check.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const targetUserId = req.nextUrl.searchParams.get("userId");
    if (!targetUserId) return jsonError(400, "user_required");

    const target = await prisma.employeeProfile.findUnique({
      where: { userId: targetUserId },
      select: { clubId: true, cityId: true, positionId: true },
    });
    if (!target) return jsonError(404, "user_not_found");

    const effective = await resolveEffectiveReadContext(user);
    if (isManagerPersonaPreview(effective.isPreviewing, effective.viewContext?.previewRole ?? null)) {
      console.warn(
        `[employee-training-denied] ${JSON.stringify({ actorUserId: user.id, reason: "manager_persona_preview" })}`,
      );
      throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого сотрудника");
    }

    const access = await resolveClubManagerCabinetAccess(user, target.clubId);
    if (!cabinetAccessCoversClub(access, target.clubId)) {
      // Sprint: manual-test-round-3, section 10 — safe observability.
      console.warn(
        `[employee-training-denied] ${JSON.stringify({
          actorUserId: user.id,
          targetClubId: target.clubId,
          userRole: user.role,
          hasEmployeeProfileClub: Boolean(user.employeeProfile?.clubId),
        })}`,
      );
      throw new AuthError(403, "forbidden", "Недостаточно прав для просмотра этого сотрудника");
    }

    return jsonOk(await getManagementEmployeeCard(targetUserId, target));
  } catch (e) {
    return handleError(e);
  }
}
