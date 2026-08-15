import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { publishInstruction } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ instruction: await publishInstruction(admin.id, id) });
  } catch (e) {
    return handleError(e);
  }
}
