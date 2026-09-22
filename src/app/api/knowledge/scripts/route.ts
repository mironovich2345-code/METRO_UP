import { requireFullAccess, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeScripts, canAccessScripts } from "@/lib/server/knowledge-public";
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
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    if (!canAccessScripts(effectiveUser.employeeProfile?.positionId)) {
      throw new AuthError(403, "forbidden", "Скрипты доступны менеджерам продаж");
    }
    return jsonOk(await getEmployeeScripts());
  } catch (e) {
    return handleError(e);
  }
}
