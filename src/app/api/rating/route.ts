import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getRatingBoard } from "@/lib/server/rating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rating — latest PUBLISHED monthly rating board (Top-10 + user row).
 * Not on the approved LIMITED whitelist — requires FULL access.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const board = await getRatingBoard(user.id);
    return jsonOk(board);
  } catch (e) {
    return handleError(e);
  }
}
