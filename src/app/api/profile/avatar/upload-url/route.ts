import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { avatarUploadRequestSchema } from "@/lib/server/schemas";
import { requestAvatarUpload } from "@/lib/server/avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/avatar/upload-url — METRO UP ROUND 1, Milestone 1.
 * Issues a short-lived signed PUT URL for the CALLER's own avatar only —
 * requireActiveAccess() derives the target user entirely from the session
 * (never a client-supplied userId; section 7's "self only" rule). Blocks a
 * SUSPENDED account like every other employee mutation; a PENDING_APPROVAL
 * account may still set an avatar (no business reason to block identity
 * personalization during onboarding review).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveAccess();
    const body = avatarUploadRequestSchema.parse(await req.json());
    const ticket = await requestAvatarUpload(user.id, body);
    return jsonOk(ticket);
  } catch (e) {
    return handleError(e);
  }
}
