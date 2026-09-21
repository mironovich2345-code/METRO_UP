import { requireUser, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext, resolveNetworkTree } from "@/lib/server/rbac/context";
import { authorize } from "@/lib/server/rbac/authorize-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/network — cities -> clubs -> employee count (Sprint 1 /
 * Phase 2B, section 20). NETWORK read scope: SYSTEM access or an active
 * OPERATIONS_DIRECTOR grant.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const actor = await getActorContext(user);
    if (!authorize(actor, { action: "network.read" })) {
      throw new AuthError(403, "forbidden", "Доступно только Операционному директору");
    }
    return jsonOk({ cities: await resolveNetworkTree() });
  } catch (e) {
    return handleError(e);
  }
}
