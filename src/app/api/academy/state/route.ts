import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyState, resolveOnboardingProgramId, resolveAcademyProgramIdsForSection } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySectionsForPersona } from "@/lib/server/rbac/scope-core";
import { resolveActiveAcademySection } from "@/lib/cabinet-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/state?section= — DB-backed per-lesson progress for the
 * current user, used by Home's "Продолжить обучение" card (PERSONAL context
 * only — see ContinueLearningCard.tsx), so it defaults to the MANAGER
 * section when no `?section=` is given (resolveActiveAcademySection's own
 * MANAGER-first fallback), same server-partitioning as academy/overview.
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL restricted
 * to the onboarding program, unaffected by section logic.
 * Sprint 1 / Phase 2D — View-As-aware; see academy/overview's comment.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const effective = await resolveEffectiveReadContext(user);
    const { effectiveUser } = effective;

    if (user.employeeProfile!.accessStatus === "PENDING_APPROVAL") {
      const restrictTo = [await resolveOnboardingProgramId()].filter((id): id is string => id !== null);
      const state = await getAcademyState(effectiveUser.id, restrictTo);
      return jsonOk(state);
    }

    const actor = await getActorContext(user);
    // Round E0, section 2 — same persona-aware fix as academy/overview.
    const previewRole = effective.isPreviewing ? (effective.viewContext!.previewRole as "MANAGER" | "CLUB_MANAGER") : null;
    const allowedSections = resolveAllowedAcademySectionsForPersona(actor, previewRole);
    const activeSection = resolveActiveAcademySection(req.nextUrl.searchParams.get("section"), allowedSections);
    const restrictTo = await resolveAcademyProgramIdsForSection(activeSection);
    const state = await getAcademyState(effectiveUser.id, restrictTo);
    return jsonOk(state);
  } catch (e) {
    return handleError(e);
  }
}
