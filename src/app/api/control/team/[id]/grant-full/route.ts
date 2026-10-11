import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { grantFullAccess } from "@/lib/server/rbac/full-access-grant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/control/team/[id]/grant-full — Sprint: LIVE QA QA-04, section E.
 * «Выдать полный доступ» for a CLUB_MANAGER or CITY_MANAGER inside their own
 * scope. No body: the only input is the target id in the path, and that id
 * is only ever CHECKED against the real actor's own grants
 * (rbac/full-access-grant.ts) — it can never widen scope. Any View As
 * context, a self target, a role outside the matrix, an out-of-scope target
 * and a SUSPENDED target are all refused there. PROJECT_ADMIN's existing
 * /control flows are untouched.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    return jsonOk(await grantFullAccess(user, id));
  } catch (e) {
    return handleError(e);
  }
}
