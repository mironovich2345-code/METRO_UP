import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { categoryUpdateSchema } from "@/lib/server/knowledge-schemas";
import { updateScriptCategory } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = categoryUpdateSchema.parse(await readJson(req));
    return jsonOk({ category: await updateScriptCategory(admin.id, id, input) });
  } catch (e) {
    return handleError(e);
  }
}
