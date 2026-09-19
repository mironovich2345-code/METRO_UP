import type { NextRequest } from "next/server";
import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { completeTask } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — complete a MANUAL task. Automatic/blocked tasks are rejected (403).
 * Daily Plan requires FULL access (see requireFullAccess). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireFullAccess();
    const { id } = await ctx.params;
    const task = await completeTask(user.id, id);
    return jsonOk({ task });
  } catch (e) {
    return handleError(e);
  }
}
