import { requireLimitedOrFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getAcademyOverview } from "@/lib/server/academy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/overview — DB-driven Program → Day cards + overall progress.
 * Academy is on the approved LIMITED whitelist (required learning) — LIMITED
 * and FULL both pass; PENDING_APPROVAL/SUSPENDED do not.
 */
export async function GET() {
  try {
    const user = await requireLimitedOrFullAccess();
    const overview = await getAcademyOverview(user.id);
    return jsonOk(overview);
  } catch (e) {
    return handleError(e);
  }
}
