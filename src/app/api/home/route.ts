import type { NextRequest } from "next/server";
import { requireActiveAccess, AuthError } from "@/lib/server/authz";
import { hasFullAccess } from "@/lib/server/access-status-logic";
import { jsonOk, handleError } from "@/lib/server/http";
import {
  getHomeDashboard,
  getPersonalHomeDashboardForPreview,
  getCityManagerHomeDashboard,
  getClubManagerHomeDashboard,
  getOnboardingHomeDashboard,
} from "@/lib/server/home";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAvailableHomeContexts } from "@/lib/server/rbac/cabinet-dashboards";
import { resolveActiveContext } from "@/lib/cabinet-ui";
import { getClubById } from "@/content/cities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads `?context=&clubId=` off the request — a raw, untrusted hint, never
 * used directly: resolveActiveContext (cabinet-ui.ts) only honors it when it
 * exactly matches one of the CALLER's own freshly-computed availableContexts. */
function parseRequestedContext(req: NextRequest): { type: string; clubId?: string | null } | null {
  const type = req.nextUrl.searchParams.get("context");
  if (!type) return null;
  return { type, clubId: req.nextUrl.searchParams.get("clubId") };
}

/**
 * GET /api/home — the Mini App's role-aware Home, one cabinet at a time.
 *
 * Sprint: mini-app-context-switcher — supersedes the previous "management
 * block appended to personal Home" design (mini-app-role-experience): a
 * request now resolves to exactly ONE of PERSONAL / CITY_MANAGER /
 * CLUB_MANAGER, never a mix. `?context=`/`&clubId=` are advisory — the
 * server always recomputes availableContexts from the REAL actor's CURRENT
 * grants and resolveActiveContext falls back to PERSONAL for anything not on
 * that list, so a client can never fabricate a context it doesn't hold
 * (section 3's authorization boundary).
 *
 * View As (section 13) is a SEPARATE, higher-priority mechanism: while an
 * active MANAGER/CLUB_MANAGER persona preview is running
 * (effective.isPreviewing), the preview alone decides the response —
 * `?context=` is ignored entirely, exactly matching the pre-existing Phase
 * 2D behavior. A CITY_MANAGER's own self-preview resolves isPreviewing:false
 * (effective-context.ts), so it falls through to normal context switching
 * for the real actor, unaffected.
 *
 * PENDING_APPROVAL/LIMITED are unaffected by any of this — same gate as
 * before (requireActiveAccess widened only for PENDING_APPROVAL's onboarding
 * path; LIMITED still explicitly re-blocked with ACCESS_LIMITED).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const status = user.employeeProfile!.accessStatus;
    if (status === "PENDING_APPROVAL") {
      return jsonOk(await getOnboardingHomeDashboard(user));
    }
    if (!hasFullAccess(status)) {
      throw new AuthError(403, "ACCESS_LIMITED", "Требуется полный доступ");
    }

    const effective = await resolveEffectiveReadContext(user);

    if (effective.isPreviewing) {
      const vc = effective.viewContext!;
      if (vc.previewRole === "CLUB_MANAGER" && vc.previewClubId) {
        const clubId = vc.previewClubId;
        const clubName = getClubById(clubId)?.name ?? null;
        const activeContext = { type: "CLUB_MANAGER" as const, clubId, clubName, label: `Управляющий · ${clubName ?? "Клуб"}` };
        const data = await getClubManagerHomeDashboard(clubId, clubName, effective.effectiveUser, true, [], activeContext);
        return jsonOk(data);
      }
      // MANAGER persona preview — personal-only, context switching inapplicable.
      return jsonOk(await getPersonalHomeDashboardForPreview(effective.effectiveUser));
    }

    // Real actor, no active preview — normal context switching.
    const actor = await getActorContext(user);
    const availableContexts = await resolveAvailableHomeContexts(user, actor);
    const active = resolveActiveContext(parseRequestedContext(req), availableContexts);

    if (active.type === "CITY_MANAGER") {
      return jsonOk(await getCityManagerHomeDashboard(user, actor, availableContexts, active));
    }
    if (active.type === "CLUB_MANAGER" && active.clubId) {
      const data = await getClubManagerHomeDashboard(active.clubId, active.clubName ?? null, user, false, availableContexts, active);
      return jsonOk(data);
    }
    return jsonOk(await getHomeDashboard(user, availableContexts, active));
  } catch (e) {
    return handleError(e);
  }
}
