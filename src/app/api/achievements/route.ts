import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getUserAchievements } from "@/lib/server/achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/achievements — full catalog with the user's awarded flags.
 * Not on the approved LIMITED whitelist — requires FULL access.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const achievements = await getUserAchievements(user.id);
    return jsonOk({ achievements });
  } catch (e) {
    return handleError(e);
  }
}
