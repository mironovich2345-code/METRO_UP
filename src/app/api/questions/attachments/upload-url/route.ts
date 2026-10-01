import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { questionAttachmentUploadRequestSchema } from "@/lib/server/schemas";
import { requestQuestionAttachmentUpload } from "@/lib/server/questions/questions-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/questions/attachments/upload-url — METRO UP ROUND 1,
 * Milestone 2A. Issues a short-lived signed PUT URL for ONE attachment,
 * namespaced under the CALLER's own `questions/<userId>/` storage prefix
 * (never a client-supplied userId — section 7's "self only" pattern,
 * reused identically from avatar uploads). The attachment is not linked to
 * any question yet — that happens atomically when POST /api/questions is
 * submitted with the resulting storageKey, which re-verifies ownership and
 * the REAL uploaded mime/size before committing anything.
 *
 * Reachable by any of the three question-sender roles — MANAGER/
 * CLUB_MANAGER/CITY_MANAGER — gated only by requireActiveAccess() (a valid,
 * non-suspended EmployeeProfile), the same minimal gate /api/questions
 * itself uses before the stricter per-senderContext check.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const body = questionAttachmentUploadRequestSchema.parse(await req.json());
    const ticket = await requestQuestionAttachmentUpload(user.id, body);
    return jsonOk(ticket);
  } catch (e) {
    return handleError(e);
  }
}
