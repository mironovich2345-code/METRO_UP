import type { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getAcademyDayDetail, isAcademyContentAllowed, resolveDayProgramId } from "@/lib/server/academy";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { resolveAllowedAcademySectionsForPersona } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/academy/days/:id — one training day with real courses/lessons.
 * Sprint: mini-app-role-experience, section 3 — PENDING_APPROVAL now reaches
 * this too, but only for a day inside the onboarding program — a day id from
 * any other program 404s exactly like a nonexistent one (never leaks whether
 * it exists, matches the existing "day_not_found" contract for a bad id).
 * Sprint: manual-test-round-2, section 4 — LIMITED/FULL are now ALSO checked
 * against the real actor's allowed Academy sections (resolveAllowedAcademySections)
 * — a direct link to a day belonging to a role section this user doesn't
 * hold 404s exactly the same way, never merely hidden client-side.
 * Sprint 1 / Phase 2D — View-As-aware; see academy/overview's comment.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireActiveAccess();
    const effective = await resolveEffectiveReadContext(user);
    const { effectiveUser } = effective;
    const { id } = await ctx.params;
    const dayProgramId = await resolveDayProgramId(id);
    const actor = await getActorContext(user);
    // Round E0, section 2 — same persona-aware fix as academy/overview; a
    // direct link to another role's day must 404 for the PREVIEWED role
    // too, not just the real actor's own (possibly higher) grants.
    const previewRole = effective.isPreviewing ? (effective.viewContext!.previewRole as "MANAGER" | "CLUB_MANAGER") : null;
    const allowedSections = resolveAllowedAcademySectionsForPersona(actor, previewRole);
    if (!(await isAcademyContentAllowed(user.employeeProfile!.accessStatus, { dayProgramId }, allowedSections))) {
      return jsonError(404, "day_not_found");
    }
    const day = await getAcademyDayDetail(effectiveUser.id, id);
    if (!day) return jsonError(404, "day_not_found");
    return jsonOk({ day });
  } catch (e) {
    return handleError(e);
  }
}
