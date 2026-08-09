import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { quizSubmitSchema } from "@/lib/server/content-schemas";
import { submitQuiz } from "@/lib/server/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — submit quiz answers. Graded server-side; pass completes the lesson. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!lesson || lesson.status !== "PUBLISHED") return jsonError(404, "lesson_not_found");
    const submission = quizSubmitSchema.parse(await readJson(req));
    const result = await submitQuiz(user.id, lesson.id, submission);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
