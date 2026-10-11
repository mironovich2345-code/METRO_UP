import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { listAuditLog, withAuditNames } from "@/lib/server/rbac/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/control/logs — Sprint: LIVE QA QA-06. The PROJECT_ADMIN «Логи»
 * surface (page + Home card). PROJECT_ADMIN only (requireSystemAccess — SPM,
 * CITY_MANAGER, OPERATIONS_DIRECTOR and everyone else get 403 here; the
 * pre-existing scoped /api/control/audit is untouched). Reads the existing
 * UserAuditLog through listAuditLog — no second logging system — and adds
 * display names. Filters: action, sinceMinutes (1–1440), page, limit.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireSystemAccess();
    const sp = req.nextUrl.searchParams;
    const num = (k: string) => {
      const v = Number(sp.get(k));
      return Number.isFinite(v) && v > 0 ? Math.trunc(v) : undefined;
    };
    const since = num("sinceMinutes");
    const result = await listAuditLog(user, {
      action: sp.get("action") || undefined,
      sinceMinutes: since ? Math.min(1440, since) : undefined,
      page: num("page"),
      limit: num("limit"),
    });
    return jsonOk({ ...result, rows: await withAuditNames(result.rows) });
  } catch (e) {
    return handleError(e);
  }
}
