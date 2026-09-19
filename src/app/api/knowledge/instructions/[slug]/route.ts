import type { NextRequest } from "next/server";
import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeInstructionBySlug } from "@/lib/server/knowledge-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Instructions are not on the approved LIMITED whitelist — requires FULL access. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireFullAccess();
    const { slug } = await ctx.params;
    return jsonOk({ instruction: await getEmployeeInstructionBySlug(slug) });
  } catch (e) {
    return handleError(e);
  }
}
