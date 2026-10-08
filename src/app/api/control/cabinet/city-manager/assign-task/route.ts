import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { cityManagerAssignTaskSchema } from "@/lib/server/club-plan-schemas";
import { createCityManagerTaskForClubManager } from "@/lib/server/city-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/control/cabinet/city-manager/assign-task — Management Round
 * E2. Body: { clubId, date, title } ONLY — no userId/createdByUserId/
 * source field exists on the request shape at all, by construction
 * (cityManagerAssignTaskSchema); the server resolves the exact target
 * (the club's own active CLUB_MANAGER), re-validates the caller's scope
 * over that exact club, and stamps createdByUserId/source itself —
 * createCityManagerTaskForClubManager's own doc comment has the full
 * validation order.
 *
 * View As (section 13): this is a POST, so src/middleware.ts's blanket
 * "any active MANAGER/CLUB_MANAGER persona preview blocks every mutating
 * method under /api/**" already covers this route — no code here opts out
 * of or duplicates that check; it is the sole, authoritative guard.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = cityManagerAssignTaskSchema.parse(await readJson(req));
    const result = await createCityManagerTaskForClubManager(user, body);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
