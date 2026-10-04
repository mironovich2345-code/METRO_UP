import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { createQuestionSchema } from "@/lib/server/schemas";
import { createEmployeeQuestion, listEmployeeQuestionsForActor } from "@/lib/server/questions/questions-service";
import { isQuestionCategoryValue, isQuestionStatusValue } from "@/lib/server/questions/questions-core";

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

/**
 * GET /api/questions — METRO UP ROUND 1, Milestone 3. Role-neutral list:
 * behavior is entirely derived from the resolved ActorContext inside
 * listEmployeeQuestionsForActor (a CITY_MANAGER gets their scoped employee
 * inbox; this same route later serves OPERATIONS_DIRECTOR/PROJECT_ADMIN with
 * zero new logic here — section 2's explicit "do not duplicate"). Query
 * params are forgiving (an unrecognized status/category is simply ignored,
 * matching /api/control/audit's own convention) — never a 400 for a stale
 * client-side filter value.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const actor = await getActorContext(user);
    const sp = req.nextUrl.searchParams;
    const statusParam = sp.get("status");
    const categoryParam = sp.get("category");
    const pageParam = Number(sp.get("page"));
    const limitParam = Number(sp.get("limit"));
    const result = await listEmployeeQuestionsForActor(actor, {
      status: statusParam && isQuestionStatusValue(statusParam) ? statusParam : undefined,
      category: categoryParam && isQuestionCategoryValue(categoryParam) ? categoryParam : undefined,
      clubId: sp.get("clubId") ?? undefined,
      page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    });
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
