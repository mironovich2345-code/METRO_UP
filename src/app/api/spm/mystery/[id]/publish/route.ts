import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { publishMystery } from "@/lib/server/spm-mystery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — publish a mystery result; employee then sees it on Home. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const spm = await requireSPM();
    const { id } = await ctx.params;
    const row = await publishMystery(spm.id, id);
    return jsonOk({ row });
  } catch (e) {
    return handleError(e);
  }
}
