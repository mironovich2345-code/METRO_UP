import type { NextRequest } from "next/server";
import { requireSystemAccess, requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getLessonDetail } from "@/lib/server/lesson-detail";
import { prisma } from "@/lib/server/db";
import { isAcademyContentAllowed, resolveOnboardingProgramId } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySections } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/lessons/:slug — the lesson for the player.
 * `?preview=1` is an ADMIN-only CMS draft-preview path (any status, no
 * progress read/write) — unrelated to View As "preview"; requires real
 * system access and is never View-As-aware.
 * Sprint: mini-app-role-experience, section 3 — the employee path now uses
 * requireActiveAccess (blocks only SUSPENDED); a PENDING_APPROVAL caller's
 * restrictToProgramId scopes them to the onboarding program only — a lesson
 * outside it 404s exactly like a nonexistent slug.
 * Sprint: manual-test-round-2, section 4 — LIMITED/FULL are now ALSO checked
 * against the real actor's allowed Academy sections — a direct link to a
 * lesson in a role section this user doesn't hold 404s the same way, never
 * merely hidden client-side. Same isAcademyContentAllowed primitive the
 * PENDING_APPROVAL case already used, extended with allowedSections.
 * Sprint 1 / Phase 2D — View-As-aware there.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const preview = req.nextUrl.searchParams.get("preview") === "1";

    let userId: string | null = null;
    let restrictToProgramId: string | null = null;
    if (preview) {
      await requireSystemAccess(); // only admins may preview drafts
    } else {
      const user = await requireActiveAccess();
      const { effectiveUser } = await resolveEffectiveReadContext(user);
      userId = effectiveUser.id;
      const status = user.employeeProfile!.accessStatus;
      if (status === "PENDING_APPROVAL") {
        restrictToProgramId = await resolveOnboardingProgramId();
      } else {
        const lessonRow = await prisma.lesson.findUnique({ where: { slug }, select: { course: { select: { programId: true } } } });
        if (lessonRow) {
          const actor = await getActorContext(user);
          const allowedSections = resolveAllowedAcademySections(actor);
          const allowed = await isAcademyContentAllowed(status, { lessonProgramId: lessonRow.course.programId }, allowedSections);
          if (!allowed) return jsonError(404, "lesson_not_found");
        }
      }
    }

    const lesson = await getLessonDetail(slug, { userId, preview, restrictToProgramId });
    if (!lesson) return jsonError(404, "lesson_not_found");
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
