import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { completeTask } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — complete a MANUAL task. Automatic/blocked tasks are rejected (403). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const task = await completeTask(user.id, id);
    return jsonOk({ task });
  } catch (e) {
    return handleError(e);
  }
}
