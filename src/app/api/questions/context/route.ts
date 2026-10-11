import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveViewContext } from "@/lib/server/rbac/view-as";
import { getQuestionContextOptions } from "@/lib/server/questions/questions-service";
import { isQuestionSenderContext } from "@/lib/server/questions/questions-core";
import type { QuestionContextDTO } from "@/lib/api/questions-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/questions/context?senderContext=… — Sprint: LIVE QA QA-04.2.
 * Tells the Ask Question form, BEFORE submit, whether its scope resolves on
 * its own (MANAGER: their EmployeeProfile; one club; one city) or needs an
 * explicit pick — and, only then, the actor's OWN authorized clubs/cities.
 * Derived from the REAL actor's current grants, never from client storage;
 * the POST re-validates whatever is picked independently.
 *
 * View As: a MANAGER/CLUB_MANAGER persona preview is read-only (the
 * middleware rejects the POST with VIEW_AS_READ_ONLY), so `previewReadOnly`
 * lets the form say so up front instead of failing on submit. A
 * CITY_MANAGER self-preview is the real actor and may submit as usual.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const requested = req.nextUrl.searchParams.get("senderContext") ?? "MANAGER";
    if (!isQuestionSenderContext(requested)) return jsonError(400, "invalid_sender_context");
    const [actor, viewContext] = await Promise.all([getActorContext(user), resolveViewContext(user)]);
    if (viewContext !== null && viewContext.previewRole !== "CITY_MANAGER") {
      // Persona preview: nothing can be submitted, and the stored Home
      // context is the PERSONA's — never resolve options for it.
      const readOnly: QuestionContextDTO = { senderContext: requested, kind: null, options: [], requiresSelection: false, previewReadOnly: true };
      return jsonOk({ context: readOnly });
    }
    const options = await getQuestionContextOptions(user, actor, requested);
    const context: QuestionContextDTO = { senderContext: requested, ...options, previewReadOnly: false };
    return jsonOk({ context });
  } catch (e) {
    return handleError(e);
  }
}
