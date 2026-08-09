import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { publishLesson } from "@/lib/server/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — validate + publish. On failure returns 400 with `details` (errors[]). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const lesson = await publishLesson(admin.id, id);
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
