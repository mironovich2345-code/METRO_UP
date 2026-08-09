import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { dayUpdateSchema } from "@/lib/server/content-schemas";
import { updateDay } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = dayUpdateSchema.parse(await readJson(req));
    const day = await updateDay(admin.id, id, input);
    return jsonOk({ day });
  } catch (e) {
    return handleError(e);
  }
}
