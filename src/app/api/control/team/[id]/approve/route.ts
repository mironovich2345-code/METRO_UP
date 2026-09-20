import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { approveManagerAccess } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approve a PENDING_APPROVAL employee of the actor's own club (Sprint 1 /
// Phase 2B section 6). Manager-only, same cross-club protection as
// control/team/[id]/access — the target must be a real EMPLOYEE of the
// actor's own club; the clubId query param is honored only for ADMIN.
const bodySchema = z.object({
  accessStatus: z.enum(["FULL", "LIMITED"]).default("FULL"),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManager();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    return jsonOk(await approveManagerAccess(manager, id, body.accessStatus, clubId, body.reason));
  } catch (e) {
    return handleError(e);
  }
}
