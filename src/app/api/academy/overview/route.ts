import { requireLimitedOrFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyOverview } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/overview — DB-driven Program → Day cards + overall progress.
 * Academy is on the approved LIMITED whitelist (required learning) — LIMITED
 * and FULL both pass; PENDING_APPROVAL/SUSPENDED do not.
 * Sprint 1 / Phase 2D — reads as the synthetic preview persona's id during
 * an active View As (MANAGER/CLUB_MANAGER); pure read, no write side effect.
 */
export async function GET() {
  try {
    const user = await requireLimitedOrFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const overview = await getAcademyOverview(effectiveUser.id);
    return jsonOk(overview);
  } catch (e) {
    return handleError(e);
  }
}
