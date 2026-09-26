import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { quizSubmitSchema } from "@/lib/server/content-schemas";
import { submitQuiz } from "@/lib/server/progress";
import { isAcademyContentAllowed } from "@/lib/server/academy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — submit quiz answers. Graded server-side; pass completes the lesson.
 * Sprint: mini-app-role-experience, section 3 — same PENDING_APPROVAL
 * onboarding-only restriction as start/complete/GET; LIMITED/FULL unchanged.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireActiveAccess();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({
      where: { slug },
      select: { id: true, status: true, course: { select: { programId: true } } },
    });
    if (!lesson || lesson.status !== "PUBLISHED") return jsonError(404, "lesson_not_found");
    if (!(await isAcademyContentAllowed(user.employeeProfile!.accessStatus, { lessonProgramId: lesson.course.programId }))) {
      return jsonError(404, "lesson_not_found");
    }
    const submission = quizSubmitSchema.parse(await readJson(req));
    const result = await submitQuiz(user.id, lesson.id, submission);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
