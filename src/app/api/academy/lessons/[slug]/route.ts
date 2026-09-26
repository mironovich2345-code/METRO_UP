import type { NextRequest } from "next/server";
import { requireSystemAccess, requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getLessonDetail } from "@/lib/server/lesson-detail";
import { resolveOnboardingProgramId } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";

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
 * outside it 404s exactly like a nonexistent slug. LIMITED/FULL unchanged.
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
      if (user.employeeProfile!.accessStatus === "PENDING_APPROVAL") {
        restrictToProgramId = await resolveOnboardingProgramId();
      }
    }

    const lesson = await getLessonDetail(slug, { userId, preview, restrictToProgramId });
    if (!lesson) return jsonError(404, "lesson_not_found");
    return jsonOk({ lesson });
  } catch (e) {
    return handleError(e);
  }
}
