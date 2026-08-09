import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { courseUpdateSchema } from "@/lib/server/content-schemas";
import { updateCourse } from "@/lib/server/content-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = courseUpdateSchema.parse(await readJson(req));
    const course = await updateCourse(admin.id, id, input);
    return jsonOk({ course });
  } catch (e) {
    return handleError(e);
  }
}
