import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { updateQuestionStatusSchema } from "@/lib/server/schemas";
import { getEmployeeQuestionForActor, updateEmployeeQuestionStatus } from "@/lib/server/questions/questions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/questions/[id] — METRO UP ROUND 1, Milestone 3. Single-question
 * detail, role-neutral (same reasoning as GET /api/questions — this route
 * will later also serve OPERATIONS_DIRECTOR with no change here).
 * Authorization (canReadQuestion) and anonymity sanitization both happen
 * inside getEmployeeQuestionForActor — never re-derived at the route layer.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActiveAccess();
    const actor = await getActorContext(user);
    const { id } = await ctx.params;
    const question = await getEmployeeQuestionForActor(actor, id);
    return jsonOk({ question });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * PATCH /api/questions/[id] — METRO UP ROUND 1, Milestone 3, section 8.
 * Status mutation, reusing updateEmployeeQuestionStatus() unchanged — no
 * client-side authority over who may call this (canChangeQuestionStatus) or
 * which status values exist. Not a one-way state machine: the body accepts
 * any of the three statuses, exactly like the service always has — only
 * authorization is checked here, never a transition table (the detail
 * page's allowedStatusTransitions is UI guidance only, see questions-core.ts).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActiveAccess();
    const actor = await getActorContext(user);
    const { id } = await ctx.params;
    const body = updateQuestionStatusSchema.parse(await readJson(req));
    const question = await updateEmployeeQuestionStatus(actor, id, body.status);
    return jsonOk({ question });
  } catch (e) {
    return handleError(e);
  }
}
