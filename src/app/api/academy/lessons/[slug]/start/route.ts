import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { startLesson } from "@/lib/server/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — mark the lesson IN_PROGRESS. Does NOT complete or award XP. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!lesson || lesson.status !== "PUBLISHED") return jsonError(404, "lesson_not_found");
    await startLesson(user.id, lesson.id);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
