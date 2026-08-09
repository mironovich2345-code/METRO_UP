import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyState } from "@/lib/server/academy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/academy/state — DB-backed per-lesson progress for the current user. */
export async function GET() {
  try {
    const user = await requireUser();
    const state = await getAcademyState(user.id);
    return jsonOk(state);
  } catch (e) {
    return handleError(e);
  }
}
