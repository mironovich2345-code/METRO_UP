import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { completeLesson } from "@/lib/server/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — complete a lesson WITHOUT a quiz (explicit CTA). Idempotent. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({ where: { slug }, select: { id: true } });
    if (!lesson) return jsonError(404, "lesson_not_found");
    const result = await completeLesson(user.id, lesson.id);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
