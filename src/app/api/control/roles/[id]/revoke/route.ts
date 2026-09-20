import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { revokeRoleAssignmentSchema } from "@/lib/server/rbac/role-assignment-schemas";
import { revokeRoleAssignment } from "@/lib/server/rbac/role-assignment-service";
import { requireNoActiveViewAs } from "@/lib/server/rbac/view-as";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/control/roles/[id]/revoke — force-suspend one RoleAssignment.
 * Hierarchy enforced inside revokeRoleAssignment() via canRevokeRole(); if
 * this was the target's last active assignment, EmployeeProfile.accessStatus
 * is also suspended (see that function's doc comment) — never assume the
 * caller only meant the one grant.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await requireNoActiveViewAs(user);
    const rl = await getRateLimiter().check(`role.revoke:${user.id}`, { max: 30, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const { id } = await ctx.params;
    const input = revokeRoleAssignmentSchema.parse(await readJson(req));
    const updated = await revokeRoleAssignment(user, id, input);
    return jsonOk({ assignment: updated });
  } catch (e) {
    return handleError(e);
  }
}
