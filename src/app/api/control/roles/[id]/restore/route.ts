import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { restoreRoleAssignmentSchema } from "@/lib/server/rbac/role-assignment-schemas";
import { restoreRoleAssignment } from "@/lib/server/rbac/role-assignment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/control/roles/[id]/restore — reactivate a SUSPENDED/ENDED
 * RoleAssignment. Same hierarchy check as revoke (restoring requires exactly
 * the authority that could have taken it away). Never touches
 * EmployeeProfile.accessStatus — see restoreRoleAssignment()'s doc comment.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().check(`role.restore:${user.id}`, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const { id } = await ctx.params;
    const input = restoreRoleAssignmentSchema.parse(await readJson(req));
    const updated = await restoreRoleAssignment(user, id, input.reason);
    return jsonOk({ assignment: updated });
  } catch (e) {
    return handleError(e);
  }
}
