import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getRankingEmployees } from "@/lib/server/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — ranking-eligible employees (real users), for filters/pickers. */
export async function GET(req: NextRequest) {
  try {
    await requireSPM();
    const sp = req.nextUrl.searchParams;
    const employees = await getRankingEmployees({
      cityId: sp.get("cityId") ?? undefined,
      clubId: sp.get("clubId") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    return jsonOk({ employees });
  } catch (e) {
    return handleError(e);
  }
}
