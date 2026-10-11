import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { listEmployeeQuestionsForActor } from "@/lib/server/questions/questions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/admin/questions-summary — Sprint: LIVE QA QA-06. The
 * PROJECT_ADMIN Home «Вопросы сотрудников» card: NEW / IN_PROGRESS totals and
 * the 5 latest NEW questions. PROJECT_ADMIN only. Reuses
 * listEmployeeQuestionsForActor UNCHANGED, so every row goes through
 * sanitizeQuestionForActor — the existing anonymity rule decides what is
 * shown (PROJECT_ADMIN keeps its audit exception; nothing is widened here).
 * Unlike /api/questions this needs no EmployeeProfile (an admin may have none).
 */
export async function GET() {
  try {
    const user = await requireSystemAccess();
    const actor = await getActorContext(user);
    const [fresh, inProgress] = await Promise.all([
      listEmployeeQuestionsForActor(actor, { status: "NEW", limit: 5 }),
      listEmployeeQuestionsForActor(actor, { status: "IN_PROGRESS", limit: 1 }),
    ]);
    return jsonOk({ newCount: fresh.total, inProgressCount: inProgress.total, latest: fresh.questions });
  } catch (e) {
    return handleError(e);
  }
}
