import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getXpBalance } from "@/lib/server/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/xp — the current user's XP balance (SUM of transactions).
 * Not on the approved LIMITED whitelist — requires FULL access.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const balance = await getXpBalance(user.id);
    return jsonOk(balance);
  } catch (e) {
    return handleError(e);
  }
}
