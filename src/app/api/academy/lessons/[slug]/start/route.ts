import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { startLesson } from "@/lib/server/progress";
import { isAcademyContentAllowed } from "@/lib/server/academy";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySections } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — mark the lesson IN_PROGRESS. Does NOT complete or award XP.
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL may now
 * start a lesson too, restricted to the onboarding program (same check as
 * the GET route).
 * Sprint: manual-test-round-2, section 4 — LIMITED/FULL are ALSO checked
 * against the real actor's allowed Academy sections.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireActiveAccess();
    const { slug } = await ctx.params;
    const lesson = await prisma.lesson.findUnique({
      where: { slug },
      select: { id: true, status: true, course: { select: { programId: true } } },
    });
    if (!lesson || lesson.status !== "PUBLISHED") return jsonError(404, "lesson_not_found");
    const actor = await getActorContext(user);
    const allowedSections = resolveAllowedAcademySections(actor);
    if (!(await isAcademyContentAllowed(user.employeeProfile!.accessStatus, { lessonProgramId: lesson.course.programId }, allowedSections))) {
      return jsonError(404, "lesson_not_found");
    }
    await startLesson(user.id, lesson.id);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
