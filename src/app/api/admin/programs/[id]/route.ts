import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { programUpdateSchema } from "@/lib/server/content-schemas";
import { updateProgram, archiveProgram } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = programUpdateSchema.parse(await readJson(req));
    const program = await updateProgram(admin.id, id, input);
    return jsonOk({ program });
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE archives (never hard-deletes) a program. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const program = await archiveProgram(admin.id, id);
    return jsonOk({ program });
  } catch (e) {
    return handleError(e);
  }
}
