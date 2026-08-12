import type { NextRequest } from "next/server";
import { requireSPMAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { getSalesRows, upsertSales } from "@/lib/server/spm-sales";
import { defaultWorkingPeriod } from "@/lib/server/spm-overview";
import { parsePeriodQuery, salesUpsertSchema } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — sales rows for a period with optional city/club/search filters. */
export async function GET(req: NextRequest) {
  try {
    await requireSPMAccess();
    const { month, year } = parsePeriodQuery(req.nextUrl, defaultWorkingPeriod());
    const sp = req.nextUrl.searchParams;
    const rows = await getSalesRows(month, year, {
      cityId: sp.get("cityId") ?? undefined,
      clubId: sp.get("clubId") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    return jsonOk({ rows });
  } catch (e) {
    return handleError(e);
  }
}

/** POST — upsert one employee's plan/fact; salesScore is computed server-side. */
export async function POST(req: NextRequest) {
  try {
    const spm = await requireSPMAccess();
    const input = salesUpsertSchema.parse(await readJson(req));
    const row = await upsertSales(spm.id, input);
    return jsonOk({ row });
  } catch (e) {
    return handleError(e);
  }
}
