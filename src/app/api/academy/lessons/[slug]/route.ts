import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getLessonDetail } from "@/lib/server/lesson-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/lessons/:slug — the lesson for the player.
 * `?preview=1` is an ADMIN-only path (any status, no progress read/write).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const preview = req.nextUrl.searchParams.get("preview") === "1";

    let userId: string | null = null;
    if (preview) {
      await requireAdmin(); // only admins may preview drafts
    } else {
      const user = await requireUser();
      userId = user.id;
    }

    const lesson = await getLessonDetail(slug, { userId, preview });
    if (!lesson) return jsonError(404, "lesson_not_found");
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
