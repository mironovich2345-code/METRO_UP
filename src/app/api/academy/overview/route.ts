import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyOverview, resolveOnboardingProgramId, resolveAcademyProgramIdsForSection } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySectionsForPersona } from "@/lib/server/rbac/scope-core";
import { resolveActiveAcademySection } from "@/lib/cabinet-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/overview?section= — DB-driven Program → Day cards +
 * overall progress, now server-partitioned by Academy role section.
 *
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL is
 * restricted to the single onboarding program (resolveOnboardingProgramId),
 * unaffected by anything below (no section concept applies to onboarding).
 *
 * Sprint: manual-test-round-2, section 4 — for LIMITED/FULL, `allowedSections`
 * is computed fresh from the REAL actor's current RoleAssignment grants
 * (never the requested/persisted value) and `?section=` is validated against
 * it (resolveActiveAcademySection, same fabrication-proof pattern as Home's
 * context switcher) — an unauthorized section always falls back to MANAGER,
 * never fabricable through the query string. The response echoes back
 * `allowedSections`/`activeSection` so the client renders the exact tabs it
 * may use and knows which one this content belongs to.
 *
 * Sprint 1 / Phase 2D — reads as the synthetic preview persona's id during
 * an active View As (MANAGER/CLUB_MANAGER); pure read, no write side effect.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const effective = await resolveEffectiveReadContext(user);
    const { effectiveUser } = effective;

    if (user.employeeProfile!.accessStatus === "PENDING_APPROVAL") {
      const restrictTo = [await resolveOnboardingProgramId()].filter((id): id is string => id !== null);
      const overview = await getAcademyOverview(effectiveUser.id, restrictTo);
      return jsonOk(overview);
    }

    const actor = await getActorContext(user);
    // Round E0, section 2 — persona-aware: a MANAGER/CLUB_MANAGER preview
    // gets exactly that role's own sections, never the real actor's
    // (possibly higher) superset. See resolveAllowedAcademySectionsForPersona's
    // own doc comment for the full root-cause explanation.
    const previewRole = effective.isPreviewing ? (effective.viewContext!.previewRole as "MANAGER" | "CLUB_MANAGER") : null;
    const allowedSections = resolveAllowedAcademySectionsForPersona(actor, previewRole);
    const activeSection = resolveActiveAcademySection(req.nextUrl.searchParams.get("section"), allowedSections);
    const restrictTo = await resolveAcademyProgramIdsForSection(activeSection);
    const overview = await getAcademyOverview(effectiveUser.id, restrictTo);
    return jsonOk({ ...overview, allowedSections, activeSection });
  } catch (e) {
    return handleError(e);
  }
}
