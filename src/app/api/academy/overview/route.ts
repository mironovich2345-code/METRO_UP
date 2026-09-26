import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyOverview, resolveOnboardingProgramId } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/overview — DB-driven Program → Day cards + overall progress.
 * Sprint: mini-app-role-experience, section 3 — the gate now allows
 * PENDING_APPROVAL through too (requireActiveAccess, blocks only SUSPENDED),
 * but a PENDING_APPROVAL caller's content is restricted to the single
 * onboarding program (resolveOnboardingProgramId) — LIMITED/FULL are
 * unaffected and still see everything, exactly as before.
 * Sprint 1 / Phase 2D — reads as the synthetic preview persona's id during
 * an active View As (MANAGER/CLUB_MANAGER); pure read, no write side effect.
 */
export async function GET() {
  try {
    const user = await requireActiveAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const restrictTo =
      user.employeeProfile!.accessStatus === "PENDING_APPROVAL"
        ? [await resolveOnboardingProgramId()].filter((id): id is string => id !== null)
        : undefined;
    const overview = await getAcademyOverview(effectiveUser.id, restrictTo);
    return jsonOk(overview);
  } catch (e) {
    return handleError(e);
  }
}
