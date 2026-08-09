import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { skipTask } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — skip a MANUAL task. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const task = await skipTask(user.id, id);
    return jsonOk({ task });
  } catch (e) {
    return handleError(e);
  }
}
