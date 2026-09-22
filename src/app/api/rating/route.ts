import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getRatingBoard } from "@/lib/server/rating";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rating — latest PUBLISHED monthly rating board (Top-10 + user row).
 * Not on the approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware; the synthetic persona never appears
 * in MonthlyRating, so a preview correctly shows the board with no
 * "current user" row highlighted, rather than the real CITY_MANAGER's own.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const board = await getRatingBoard(effectiveUser.id);
    return jsonOk(board);
  } catch (e) {
    return handleError(e);
  }
}
