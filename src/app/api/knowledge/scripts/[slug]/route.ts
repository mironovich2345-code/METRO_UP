import type { NextRequest } from "next/server";
import { requireFullAccess, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeScriptBySlug, canAccessScripts } from "@/lib/server/knowledge-public";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scripts are not on the approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — the position gate below is the whole reason View As
 * requires an EXPLICIT previewPositionId (knowledge-access.ts's
 * SCRIPT_POSITIONS excludes ADMINISTRATOR): a CITY_MANAGER previewing a
 * MANAGER sees exactly what THAT chosen position would see here, including
 * a 403 if they picked a non-sales position.
 *
 * Sprint: REMEDIATION R2, F-03 — this detail route had fallen out of sync
 * with its list sibling (GET /api/knowledge/scripts): it gated on
 * `user.employeeProfile?.positionId` (the REAL actor's own position) instead
 * of the effective (persona-aware) one, so a View-As preview of a
 * sales-eligible position still 403'd here — the list showed scripts the
 * detail route then refused to open. Now identical to the list route.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    if (!canAccessScripts(effectiveUser.employeeProfile?.positionId)) {
      throw new AuthError(403, "forbidden", "Скрипты доступны менеджерам продаж");
    }
    const { slug } = await ctx.params;
    return jsonOk({ script: await getEmployeeScriptBySlug(slug) });
  } catch (e) {
    return handleError(e);
  }
}
