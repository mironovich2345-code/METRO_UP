import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { avatarCompleteSchema } from "@/lib/server/schemas";
import { completeAvatarUpload } from "@/lib/server/avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/avatar/complete — METRO UP ROUND 1, Milestone 1. Verifies
 * the upload actually landed (storage.headObject) and re-validates the REAL
 * mime/size before committing it as the CALLER's own avatar —
 * completeAvatarUpload itself enforces that `storageKey` falls under this
 * exact session's own `avatars/<userId>/` namespace, so a client can never
 * complete with a key it wasn't issued (section 7).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const body = avatarCompleteSchema.parse(await req.json());
    const result = await completeAvatarUpload(user.id, body.storageKey);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
