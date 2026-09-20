import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { setEmployeeAccess } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set an ALREADY-APPROVED employee's access level: FULL/LIMITED (normal
// adjustment) or SUSPENDED (revoke — Sprint 1 / Phase 2B section 7; the
// server audits the transition as ACCESS_SUSPENDED/ACCESS_RESTORED/
// ACCESS_GRANTED depending on direction, see resolveAccessAuditAction in
// club-plan.ts). A still-PENDING_APPROVAL target is rejected (409) — use
// POST .../approve for that transition instead. Manager-only; the server
// verifies the target is an EMPLOYEE of the actor's own club (never trusts a
// client-supplied club/user). The clubId param is honored only for ADMIN.
const bodySchema = z.object({ accessStatus: z.enum(["FULL", "LIMITED", "SUSPENDED"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManager();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    return jsonOk(await setEmployeeAccess(manager, id, body.accessStatus, clubId));
  } catch (e) {
    return handleError(e);
  }
}
