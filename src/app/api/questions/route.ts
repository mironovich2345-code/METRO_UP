import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { createQuestionSchema } from "@/lib/server/schemas";
import { createEmployeeQuestion } from "@/lib/server/questions/questions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/questions — METRO UP ROUND 1, Milestone 2A. Creates the one
 * source-of-truth EmployeeQuestion row. All business logic (role validation,
 * server-derived city/club snapshot, attachment re-verification, audit,
 * anonymity sanitization) lives in questions-service.ts — this route only
 * authenticates, validates the request shape, and calls through (section 9).
 *
 * No notification delivery here (section 10, deliberately deferred to
 * Milestone 4) — the route returns as soon as the question is persisted.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const actor = await getActorContext(user);
    const body = createQuestionSchema.parse(await req.json());
    const question = await createEmployeeQuestion(user, actor, body);
    return jsonOk({ question });
  } catch (e) {
    return handleError(e);
  }
}
