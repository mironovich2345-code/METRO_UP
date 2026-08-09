import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { getMysteryRows, upsertMystery } from "@/lib/server/spm-mystery";
import { defaultWorkingPeriod } from "@/lib/server/spm-overview";
import { parsePeriodQuery, mysteryUpsertSchema } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSPM();
    const { month, year } = parsePeriodQuery(req.nextUrl, defaultWorkingPeriod());
    const sp = req.nextUrl.searchParams;
    const rows = await getMysteryRows(month, year, {
      cityId: sp.get("cityId") ?? undefined,
      clubId: sp.get("clubId") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    return jsonOk({ rows });
  } catch (e) {
    return handleError(e);
  }
}

/** POST — upsert a DRAFT mystery result (score 0–100 validated server-side). */
export async function POST(req: NextRequest) {
  try {
    const spm = await requireSPM();
    const input = mysteryUpsertSchema.parse(await readJson(req));
    const row = await upsertMystery(spm.id, input);
    return jsonOk({ row });
  } catch (e) {
    return handleError(e);
  }
}
