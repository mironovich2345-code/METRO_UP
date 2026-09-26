import { requireActiveAccess, AuthError } from "@/lib/server/authz";
import { hasFullAccess } from "@/lib/server/access-status-logic";
import { jsonOk, handleError } from "@/lib/server/http";
import { getHomeDashboardFor, getOnboardingHomeDashboard } from "@/lib/server/home";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home — aggregated production dashboard for the current user.
 *
 * Sprint: mini-app-role-experience, section 2 — gate widened from
 * requireFullAccess() to requireActiveAccess() (blocks only SUSPENDED) ONLY
 * so a PENDING_APPROVAL user can reach this route: they get the deliberately
 * tiny OnboardingHomeDTO (kind:"onboarding" — profile + onboarding-course
 * progress only, see home.ts), never the full dashboard. LIMITED is
 * deliberately re-blocked right after with the exact same "ACCESS_LIMITED"
 * error requireFullAccess used to throw for it — LIMITED is not one of this
 * sprint's four approved states and must not gain a new route to Home data
 * just because the gate widened for PENDING_APPROVAL. FULL is unaffected —
 * same getHomeDashboardFor path as before, now additionally kind:"full" +
 * roleLabel/management (Sprint 1 / Phase 2D View-As semantics unchanged,
 * still never calls the real getPlanToday() for a preview — see home.ts's
 * comment).
 *
 * Note: PENDING_APPROVAL cannot be previewed via View As (view-as.ts only
 * ever starts a preview for a CITY_MANAGER actor, whose own accessStatus is
 * FULL), so the onboarding branch always uses the real user directly.
 */
export async function GET() {
  try {
    const user = await requireActiveAccess();
    const status = user.employeeProfile!.accessStatus;
    if (status === "PENDING_APPROVAL") {
      const data = await getOnboardingHomeDashboard(user);
      return jsonOk(data);
    }
    if (!hasFullAccess(status)) {
      throw new AuthError(403, "ACCESS_LIMITED", "Требуется полный доступ");
    }
    const ctx = await resolveEffectiveReadContext(user);
    const data = await getHomeDashboardFor(ctx);
    return jsonOk(data);
  } catch (e) {
    return handleError(e);
  }
}
