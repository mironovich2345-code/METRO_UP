import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyState, resolveOnboardingProgramId } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/state — DB-backed per-lesson progress for the current user.
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL now reaches
 * this too, restricted to the onboarding program; see academy/overview's
 * comment for the full reasoning. LIMITED/FULL unchanged.
 * Sprint 1 / Phase 2D — View-As-aware; see academy/overview's comment.
 */
export async function GET() {
  try {
    const user = await requireActiveAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const restrictTo =
      user.employeeProfile!.accessStatus === "PENDING_APPROVAL"
        ? [await resolveOnboardingProgramId()].filter((id): id is string => id !== null)
        : undefined;
    const state = await getAcademyState(effectiveUser.id, restrictTo);
    return jsonOk(state);
  } catch (e) {
    return handleError(e);
  }
}
