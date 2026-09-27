import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getRatingBoard } from "@/lib/server/rating";
import { resolveEffectiveReadContext } from "@/lib/server/rbac/effective-context";
import { getActorContext } from "@/lib/server/rbac/context";
import { hasActiveRole } from "@/lib/server/rbac/scope-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rating — latest PUBLISHED monthly rating board (Top-10 + user row).
 * Not on the approved LIMITED whitelist — requires FULL access.
 * Sprint 1 / Phase 2D — View-As-aware; the synthetic persona never appears
 * in MonthlyRating, so a preview correctly shows the board with no
 * "current user" row highlighted, rather than the real CITY_MANAGER's own.
 *
 * Sprint: manual-test-round-2, section 5 — `canViewClubMode` is computed
 * from the REAL actor's current RoleAssignment grants (never a query param
 * or client state) so the Mini App only ever renders the Менеджеры/Клубы
 * toggle for a genuine CITY_MANAGER. The board itself is UNCHANGED for
 * every role (MANAGER/CLUB_MANAGER keep the exact same existing employee
 * ranking) — see ranking/page.tsx's own comment for why "Клубы" has no real
 * data behind it yet.
 */
export async function GET() {
  try {
    const user = await requireFullAccess();
    const { effectiveUser } = await resolveEffectiveReadContext(user);
    const actor = await getActorContext(user);
    const canViewClubMode = hasActiveRole(actor.grants, "CITY_MANAGER");
    const board = await getRatingBoard(effectiveUser.id);
    return jsonOk({ ...board, canViewClubMode });
  } catch (e) {
    return handleError(e);
  }
}
