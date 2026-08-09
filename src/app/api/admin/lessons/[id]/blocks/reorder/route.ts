import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { reorderSchema } from "@/lib/server/content-schemas";
import { reorderBlocks } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { ids } = reorderSchema.parse(await readJson(req));
    await reorderBlocks(admin.id, id, ids);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
