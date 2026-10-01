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
import { perfTimed, logPerf } from "@/lib/server/perf";

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
/**
 * Sprint: mini-app-performance, section 3/16 — "total request duration" for
 * the single most-visited screen, as the concrete example of perfTimed's
 * per-route usage (opt-in via PERF_LOG=1, see perf.ts). Not applied
 * blanket-wide across the API surface this round — see the performance
 * report's "Auth/context optimization" section for why that was judged out
 * of proportion to the audit's findings.
 */
export async function GET(req: NextRequest) {
  return perfTimed("api.home", () => handleGet(req));
}

/**
 * Sprint: mini-app-server-startup, section 4/6 — the coarse, route-owned
 * phases (auth/effective-context/actor/contexts) as ONE consolidated
 * [perf-home] line; `kind` says which dashboard builder was reached, whose
 * OWN internal breakdown logs separately as [perf-home-personal] /
 * [perf-home-city-manager] / [perf-home-club-manager] (home.ts) — two
 * correlated lines per request rather than one, because the phases below
 * and the dashboard builder's own widget timings live in different modules;
 * forcing them into a single return-value plumbed across that boundary was
 * judged more invasive than this round's evidence justified. Both lines
 * share the same request's wall-clock proximity in the log, which is enough
 * to read them together.
 */
async function handleGet(req: NextRequest) {
  const t0 = performance.now();
  try {
    const authStart = performance.now();
    const user = await requireActiveAccess();
    const authMs = Math.round(performance.now() - authStart);

    const status = user.employeeProfile!.accessStatus;
    if (status === "PENDING_APPROVAL") {
      logPerf("perf-home", { totalMs: Math.round(performance.now() - t0), authMs, kind: "onboarding" });
      return jsonOk(await getOnboardingHomeDashboard(user));
    }
    if (!hasFullAccess(status)) {
      throw new AuthError(403, "ACCESS_LIMITED", "Требуется полный доступ");
    }

    const effectiveStart = performance.now();
    const effective = await resolveEffectiveReadContext(user);
    const effectiveMs = Math.round(performance.now() - effectiveStart);

    if (effective.isPreviewing) {
      const vc = effective.viewContext!;
      if (vc.previewRole === "CLUB_MANAGER" && vc.previewClubId) {
        const clubId = vc.previewClubId;
        const clubName = getClubById(clubId)?.name ?? null;
        const activeContext = { type: "CLUB_MANAGER" as const, clubId, clubName, label: `Управляющий · ${clubName ?? "Клуб"}` };
        const data = await getClubManagerHomeDashboard(clubId, clubName, effective.effectiveUser, true, [], activeContext);
        logPerf("perf-home", { totalMs: Math.round(performance.now() - t0), authMs, effectiveMs, kind: "preview-club-manager" });
        return jsonOk(data);
      }
      // MANAGER persona preview — personal-only, context switching inapplicable.
      const data = await getPersonalHomeDashboardForPreview(effective.effectiveUser);
      logPerf("perf-home", { totalMs: Math.round(performance.now() - t0), authMs, effectiveMs, kind: "preview-personal" });
      return jsonOk(data);
    }

    // Real actor, no active preview — normal context switching.
    const actorStart = performance.now();
    const actor = await getActorContext(user);
    const actorMs = Math.round(performance.now() - actorStart);

    const contextsStart = performance.now();
    const { contexts: availableContexts, cityManagerClubs } = await resolveAvailableHomeContexts(user, actor);
    const contextsMs = Math.round(performance.now() - contextsStart);

    const active = resolveActiveContext(parseRequestedContext(req), availableContexts);
    const baseFields = { totalMs: 0, authMs, effectiveMs, actorMs, contextsMs };

    if (active.type === "CITY_MANAGER") {
      // Sprint: mini-app-server-startup, section 6/7 — reuse the clubs list
      // resolveAvailableHomeContexts just resolved (to label the context
      // switcher) instead of letting getCityManagerHomeDashboard's chain
      // call resolveCityManagerClubs a second time for the same actor.
      const data = await getCityManagerHomeDashboard(user, actor, availableContexts, active, cityManagerClubs ?? undefined);
      logPerf("perf-home", { ...baseFields, totalMs: Math.round(performance.now() - t0), kind: "city_manager" });
      return jsonOk(data);
    }
    if (active.type === "CLUB_MANAGER" && active.clubId) {
      const data = await getClubManagerHomeDashboard(active.clubId, active.clubName ?? null, user, false, availableContexts, active);
      logPerf("perf-home", { ...baseFields, totalMs: Math.round(performance.now() - t0), kind: "club_manager" });
      return jsonOk(data);
    }
    const data = await getHomeDashboard(user, availableContexts, active);
    logPerf("perf-home", { ...baseFields, totalMs: Math.round(performance.now() - t0), kind: "full" });
    return jsonOk(data);
  } catch (e) {
    return handleError(e);
  }
}
