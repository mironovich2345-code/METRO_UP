import type { NextRequest } from "next/server";
import { requireClubManagerAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { deleteManagerTask } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE — remove a one-off (non-completed) manager task in the manager's
 * club. Sprint: REMEDIATION R4, F-05 — gate swapped to
 * requireClubManagerAccess (see control/plan/route.ts's header comment).
 * deleteManagerTask -> resolveScopedClubId (already grant-aware,
 * unchanged) resolves the real club, then the task's own
 * employeeProfile.clubId is compared against it — ownership is decided by
 * club membership, never by actor.role, so this gate change cannot widen
 * deletion to another club's task.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManagerAccess();
    const { id } = await ctx.params;
    const clubId = req.nextUrl.searchParams.get("clubId");
    await deleteManagerTask(manager, id, clubId);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
