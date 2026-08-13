import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { toggleChecklistItem } from "@/lib/server/daily-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ itemId: z.string().min(1).max(64), done: z.boolean() });

/** POST — toggle one checklist item of the current user's OWN task. Ownership is
 * enforced server-side; completing the required items auto-completes the task. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { itemId, done } = bodySchema.parse(await readJson(req));
    const task = await toggleChecklistItem(user.id, id, itemId, done);
    return jsonOk({ task });
  } catch (e) {
    return handleError(e);
  }
}
