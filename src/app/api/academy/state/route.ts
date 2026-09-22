import { requireLimitedOrFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyState } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/state — DB-backed per-lesson progress for the current user.
 * Academy is on the approved LIMITED whitelist — see requireLimitedOrFullAccess.
 * Sprint 1 / Phase 2D — View-As-aware; see academy/overview's comment.
 */
export async function GET() {
  try {
    const user = await requireLimitedOrFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const state = await getAcademyState(effectiveUser.id);
    return jsonOk(state);
  } catch (e) {
    return handleError(e);
  }
}
