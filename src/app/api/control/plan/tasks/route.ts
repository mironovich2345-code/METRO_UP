import type { NextRequest } from "next/server";
import { requireClubManagerAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { createManagerTask } from "@/lib/server/club-plan";
import { managerTaskSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — create a one-off manager task for the manager's own club
 * (server-scoped). Sprint: REMEDIATION R4, F-05 — gate swapped to
 * requireClubManagerAccess (see control/plan/route.ts's header comment
 * for the full rationale). createManagerTask -> resolveScopedClubId
 * (already grant-aware, unchanged) independently re-verifies the
 * requested clubId against a real active CLUB_MANAGER grant.
 */
export async function POST(req: NextRequest) {
  try {
    const manager = await requireClubManagerAccess();
    const input = managerTaskSchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    const result = await createManagerTask(manager, input, clubId);
    return jsonOk(result, 201);
  } catch (e) {
    return handleError(e);
  }
}
