import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getUserAchievements } from "@/lib/server/achievements";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/achievements — full catalog with the user's awarded flags.
 * Not on the approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware; see xp/route.ts's comment.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const achievements = await getUserAchievements(effectiveUser.id);
    return jsonOk({ achievements });
  } catch (e) {
    return handleError(e);
  }
}
