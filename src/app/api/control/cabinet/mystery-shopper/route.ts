import type { NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { resolveClubManagerCabinetAccess } from "@/lib/server/rbac/cabinet-dashboards";
import { getActorContext, resolveCityManagerClubs } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";
import { requireNoManagerPersonaPreview } from "@/lib/server/rbac/effective-context";
import { getClubMysteryShopper, getCityMysteryShopper } from "@/lib/server/mystery-shopper";
import { parsePeriodQuery } from "@/lib/server/mystery-shopper-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/cabinet/mystery-shopper?clubId=&month=&year= —
 * Management Round E3. ONE shared route for CLUB_MANAGER (own club) and
 * CITY_MANAGER (effective scope, or a drill-down into one scoped club).
 *
 * Dispatch mirrors club-manager/route.ts exactly: resolveClubManagerCabinetAccess
 * is tried FIRST, with the raw clubId query param — this one existing,
 * already-audited function ALREADY covers every "club" case the round
 * brief asks for: a real CLUB_MANAGER's own club (tiers 2/3), a
 * CITY_MANAGER drilling into one scoped club via club.read (tier 4), and
 * an active View-As CLUB_MANAGER preview, which wins regardless of
 * clubId (tier 1 — the exact "reflect the previewed persona, read-only"
 * behavior section 23 asks for, with zero new RBAC code). A clubId that
 * fails every tier is ALWAYS a 403 here — the server never trusts it,
 * never silently falls back to a broader scope (section 11/12). Only when
 * NO clubId was supplied AT ALL does this fall through to the
 * CITY_MANAGER root scope (section 9) — never for OPERATIONS_DIRECTOR or
 * any other role this round deliberately excludes.
 *
 * Sprint: REMEDIATION R2.2 — traced (not assumed) TWO distinct leaks for a
 * View-As MANAGER preview, both now closed by requireNoManagerPersonaPreview
 * running BEFORE either path below: (1) the same tier-4 fallthrough R2.1
 * found in Employee Card — a clubId hint resolves via resolveClubManagerCabinetAccess's
 * tier 4 (club.read, the REAL actor's own scope), leaking that club's
 * management Mystery Shopper data; (2) a SECOND, independent leak with NO
 * clubId at all — the root CITY_MANAGER fallback below checks the REAL
 * actor's own active grant membership with ZERO preview awareness,
 * leaking the entire city-wide (both clubs) management workspace. A
 * View-As CLUB_MANAGER preview (tier 1) and a real, non-previewing
 * CITY_MANAGER (root scope or drill-down) are both unaffected.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    await requireNoManagerPersonaPreview(user);
    const clubIdParam = req.nextUrl.searchParams.get("clubId");
    const period = parsePeriodQuery(req.nextUrl.searchParams.get("month"), req.nextUrl.searchParams.get("year"));

    const access = await resolveClubManagerCabinetAccess(user, clubIdParam);
    if (access) {
      return jsonOk(await getClubMysteryShopper(access.clubId, access.clubName, access.isPreviewing, period));
    }

    if (clubIdParam) {
      // A clubId hint was given but resolved via none of the four tiers —
      // foreign club or a revoked grant. Never fall back to the root scope.
      throw new AuthError(403, "forbidden", "Клуб не входит в вашу зону ответственности");
    }

    const actor = await getActorContext(user);
    if (!hasActiveRole(actor.grants, "CITY_MANAGER")) {
      throw new AuthError(403, "forbidden", "Доступно управляющему клубом или Ст. города");
    }
    const clubs = await resolveCityManagerClubs(actor);
    return jsonOk(await getCityMysteryShopper(clubs, period));
  } catch (e) {
    return handleError(e);
  }
}
