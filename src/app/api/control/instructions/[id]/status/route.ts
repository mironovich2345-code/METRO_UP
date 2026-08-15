import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { setInstructionStatus } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["DRAFT", "ARCHIVED"]) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { status } = bodySchema.parse(await readJson(req));
    return jsonOk({ instruction: await setInstructionStatus(admin.id, id, status) });
  } catch (e) {
    return handleError(e);
  }
}
