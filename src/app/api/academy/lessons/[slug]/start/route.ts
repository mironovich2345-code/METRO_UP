import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { startLesson } from "@/lib/server/progress";
import { isAcademyContentAllowed } from "@/lib/server/academy";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySectionsForPersona } from "@/lib/server/rbac/scope-core";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — mark the lesson IN_PROGRESS. Does NOT complete or award XP.
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL may now
 * start a lesson too, restricted to the onboarding program (same check as
 * the GET route).
 * Sprint: manual-test-round-2, section 4 — LIMITED/FULL are ALSO checked
 * against the real actor's allowed Academy sections.
 * Sprint: REMEDIATION R2, F-02 — the section check is now persona-aware
 * (resolveAllowedAcademySectionsForPersona), matching GET
 * /api/academy/lessons/[slug] and the other Academy read routes: a View-As
 * MANAGER/CLUB_MANAGER preview's sections are evaluated for the PREVIEWED
 * persona, not only the real actor's own grants, so this mutation can no
 * longer 404 a lesson the GET route (which already was persona-aware)
 * happily rendered. The identity passed to startLesson below is still
 * user.id — the REAL actor — this only widens/narrows which lesson is
 * considered in-scope, never who progress is recorded for. Layer 1
 * (src/middleware.ts's VIEW_AS_READ_ONLY block on every mutating method
 * during a genuine MANAGER/CLUB_MANAGER preview) is untouched and still
 * rejects this very request before it reaches here — this persona-aware
 * resolver is an independent Layer 2 for the one caller the real actor
 * (CITY_MANAGER self-preview or no preview) still reaches.
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
    const effective = await resolveEffectiveReadContext(user);
    const previewRole = effective.isPreviewing ? (effective.viewContext!.previewRole as "MANAGER" | "CLUB_MANAGER") : null;
    const allowedSections = resolveAllowedAcademySectionsForPersona(actor, previewRole);
    if (!(await isAcademyContentAllowed(user.employeeProfile!.accessStatus, { lessonProgramId: lesson.course.programId }, allowedSections))) {
      return jsonError(404, "lesson_not_found");
    }
    await startLesson(user.id, lesson.id);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
