import type { NextRequest } from "next/server";
import { requireLimitedOrFullAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getAcademyDayDetail } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/days/:id — one training day with real courses/lessons.
 * Academy is on the approved LIMITED whitelist — see requireLimitedOrFullAccess.
 * Sprint 1 / Phase 2D — View-As-aware; see academy/overview's comment.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireLimitedOrFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const { id } = await ctx.params;
    const day = await getAcademyDayDetail(effectiveUser.id, id);
    if (!day) return jsonError(404, "day_not_found");
    return jsonOk({ day });
  } catch (e) {
    return handleError(e);
  }
}
