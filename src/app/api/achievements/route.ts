import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getUserAchievements } from "@/lib/server/achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/achievements — full catalog with the user's awarded flags. */
export async function GET() {
  try {
    const user = await requireUser();
    const achievements = await getUserAchievements(user.id);
    return jsonOk({ achievements });
  } catch (e) {
    return handleError(e);
  }
}
