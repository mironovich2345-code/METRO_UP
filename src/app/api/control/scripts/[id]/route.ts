import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { scriptUpdateSchema } from "@/lib/server/knowledge-schemas";
import { getScript, updateScript } from "@/lib/server/knowledge-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ script: await getScript(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = scriptUpdateSchema.parse(await readJson(req));
    return jsonOk({ script: await updateScript(admin.id, id, input) });
  } catch (e) {
    return handleError(e);
  }
}
