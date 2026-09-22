import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getXpBalance } from "@/lib/server/progress";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/xp — the current user's XP balance (SUM of transactions).
 * Not on the approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware; the synthetic persona has no
 * XPTransaction rows, so a preview correctly shows a fresh 0-XP balance.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const balance = await getXpBalance(effectiveUser.id);
    return jsonOk(balance);
  } catch (e) {
    return handleError(e);
  }
}
