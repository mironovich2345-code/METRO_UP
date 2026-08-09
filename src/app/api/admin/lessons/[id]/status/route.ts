import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { setLessonStatus } from "@/lib/server/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["DRAFT", "ARCHIVED"]) });

/** POST — unpublish (→DRAFT) or archive a lesson. Never hard-deletes. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { status } = bodySchema.parse(await readJson(req));
    const lesson = await setLessonStatus(admin.id, id, status);
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
