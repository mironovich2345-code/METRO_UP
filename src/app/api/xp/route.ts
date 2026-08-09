import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getXpBalance } from "@/lib/server/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/xp — the current user's XP balance (SUM of transactions). */
export async function GET() {
  try {
    const user = await requireUser();
    const balance = await getXpBalance(user.id);
    return jsonOk(balance);
  } catch (e) {
    return handleError(e);
  }
}
