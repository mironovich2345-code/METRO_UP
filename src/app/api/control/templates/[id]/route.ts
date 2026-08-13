import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { updateClubTemplate } from "@/lib/server/club-plan";
import { templateUpdateSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH — edit / enable-disable a club template (own club only). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManager();
    const { id } = await ctx.params;
    const input = templateUpdateSchema.parse(await readJson(req));
    const template = await updateClubTemplate(manager, id, input);
    return jsonOk({ template });
  } catch (e) {
    return handleError(e);
  }
}
