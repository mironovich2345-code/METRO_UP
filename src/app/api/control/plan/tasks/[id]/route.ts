import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { deleteManagerTask } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE — remove a one-off (non-completed) manager task in the manager's club. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManager();
    const { id } = await ctx.params;
    const clubId = req.nextUrl.searchParams.get("clubId");
    await deleteManagerTask(manager, id, clubId);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
