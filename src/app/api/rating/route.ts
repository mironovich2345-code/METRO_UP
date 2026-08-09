import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getRatingBoard } from "@/lib/server/rating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/rating — latest PUBLISHED monthly rating board (Top-10 + user row). */
export async function GET() {
  try {
    const user = await requireUser();
    const board = await getRatingBoard(user.id);
    return jsonOk(board);
  } catch (e) {
    return handleError(e);
  }
}
