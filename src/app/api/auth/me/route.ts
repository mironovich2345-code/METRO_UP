import { getCurrentUser } from "@/lib/server/session";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — the session user, or 401 when unauthenticated.
 * SUSPENDED gets the same neutral, non-503 contract as every other
 * employee-facing route (see requireActiveAccess in authz.ts) — but this
 * route must stay reachable with NO EmployeeProfile at all (a brand-new user
 * checking whether they still need onboarding), so it checks accessStatus
 * inline rather than going through a requireEmployeeProfile()-based
 * primitive, which would wrongly 409 a pre-onboarding user.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "unauthorized");
    if (user.employeeProfile?.accessStatus === "SUSPENDED") {
      return jsonError(403, "APP_TEMPORARILY_UNAVAILABLE");
    }
    return jsonOk({ user: meDTO(user) });
  } catch (error) {
    return handleError(error);
  }
}
