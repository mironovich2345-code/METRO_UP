import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { setEmployeeAccess } from "@/lib/server/club-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grant (FULL) or revoke (LIMITED) an employee's full access. Manager-only; the
// server verifies the target is an EMPLOYEE of the actor's own club (never trusts
// a client-supplied club/user). The clubId param is honored only for ADMIN.
const bodySchema = z.object({ accessStatus: z.enum(["FULL", "LIMITED"]) });

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
