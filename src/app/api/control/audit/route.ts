import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { listAuditLog } from "@/lib/server/rbac/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/audit — scoped, paginated UserAuditLog read (Sprint 1 /
 * Phase 2B, section 21). Scope enforced inside listAuditLog(): PROJECT_ADMIN/
 * OPERATIONS_DIRECTOR see everything, CITY_MANAGER sees their zone,
 * CLUB_MANAGER sees their own club, a plain MANAGER gets 403 (never an empty
 * 200 — see role-assignment-service.ts's list() for the same reasoning).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const page = sp.get("page") ? Number(sp.get("page")) : undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
    const result = await listAuditLog(user, {
      actorUserId: sp.get("actorUserId") ?? undefined,
      targetUserId: sp.get("targetUserId") ?? undefined,
      action: sp.get("action") ?? undefined,
      clubId: sp.get("clubId") ?? undefined,
      cityId: sp.get("cityId") ?? undefined,
      page: Number.isFinite(page) ? page : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
