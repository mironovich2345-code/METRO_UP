import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getClubTeam } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the manager's own club team (real employees, no technical ids). */
export async function GET(req: NextRequest) {
  try {
    const manager = await requireClubManager();
    const clubId = req.nextUrl.searchParams.get("clubId");
    return jsonOk(await getClubTeam(manager, clubId));
  } catch (e) {
    return handleError(e);
  }
}
