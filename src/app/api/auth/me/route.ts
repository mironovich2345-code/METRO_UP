import { getCurrentUser } from "@/lib/server/session";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";
import { isAccessSuspended } from "@/lib/server/access-status-logic";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — the session user, or 401 when unauthenticated.
 * SUSPENDED gets the same neutral, non-503 contract as every other
 * employee-facing route (see requireActiveAccess in authz.ts) — but this
 * route must stay reachable with NO EmployeeProfile at all (a brand-new user
 * checking whether they still need onboarding), so it checks accessStatus
 * inline rather than going through a requireEmployeeProfile()-based
 * primitive, which would wrongly 409 a pre-onboarding user. This check is
 * always against the REAL user — a preview never runs for a suspended actor
 * (startViewAs already refuses to start one; this is what would also stop a
 * SUSPENDED CITY_MANAGER's still-live, not-yet-expired preview cookie).
 *
 * Sprint 1 / Phase 2D — this is THE bridge that makes View As work for the
 * whole Mini-App with no changes to individual page components: almost
 * every screen's state (useApp().profile, isOnboarded, BottomNavigation's
 * accessStatus-based filtering, AccessStatusGate) derives from this one
 * response via AppUserProvider/AppProvider. When a MANAGER/CLUB_MANAGER
 * preview is active, `user` in the response is the synthetic read persona
 * (effectiveUser) — the real actor's own identity/authorization is
 * untouched (resolveEffectiveReadContext never modifies session state),
 * and `viewContext` tells the client to render the "previewing" banner.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "unauthorized");
    if (isAccessSuspended(user.employeeProfile?.accessStatus)) {
      return jsonError(403, "APP_TEMPORARILY_UNAVAILABLE");
    }
    const effective = await resolveEffectiveReadContext(user);
    const viewContext = effective.isPreviewing
      ? { previewRole: effective.viewContext!.previewRole, realRoleLabel: "Ст. города" }
      : null;
    return jsonOk({ user: meDTO(effective.effectiveUser, viewContext) });
  } catch (error) {
    return handleError(error);
  }
}
