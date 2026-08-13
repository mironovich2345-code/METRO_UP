import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubTeam } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the manager's own club team (real employees, no technical ids). */
export async function GET() {
  try {
    const manager = await requireClubManager();
    return jsonOk(await getClubTeam(manager));
  } catch (e) {
    return handleError(e);
  }
}
