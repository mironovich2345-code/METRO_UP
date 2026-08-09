import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { blockUpdateSchema } from "@/lib/server/content-schemas";
import { updateBlock, deleteBlock } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = blockUpdateSchema.parse(await readJson(req));
    const block = await updateBlock(admin.id, id, input);
    return jsonOk({ block });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await deleteBlock(admin.id, id);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
