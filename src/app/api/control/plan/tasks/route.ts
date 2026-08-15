import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { createManagerTask } from "@/lib/server/club-plan";
import { managerTaskSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — create a one-off manager task for the manager's own club (server-scoped). */
export async function POST(req: NextRequest) {
  try {
    const manager = await requireClubManager();
    const input = managerTaskSchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    const result = await createManagerTask(manager, input, clubId);
    return jsonOk(result, 201);
  } catch (e) {
    return handleError(e);
  }
}
