import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { completeLesson } from "@/lib/server/progress";
import { isAcademyContentAllowed } from "@/lib/server/academy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — complete a lesson WITHOUT a quiz (explicit CTA). Idempotent.
 * Sprint: mini-app-role-experience, section 3 — same PENDING_APPROVAL
 * onboarding-only restriction as start/GET; LIMITED/FULL unchanged.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireActiveAccess();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({
      where: { slug },
      select: { id: true, course: { select: { programId: true } } },
    });
    if (!lesson) return jsonError(404, "lesson_not_found");
    if (!(await isAcademyContentAllowed(user.employeeProfile!.accessStatus, { lessonProgramId: lesson.course.programId }))) {
      return jsonError(404, "lesson_not_found");
    }
    const result = await completeLesson(user.id, lesson.id);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
