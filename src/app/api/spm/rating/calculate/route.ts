import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { calculateMonthlyRating } from "@/lib/server/rating-calc";
import { periodActionSchema } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — calculate the rating for a period (SPM only). Sets period READY. */
export async function POST(req: NextRequest) {
  try {
    const spm = await requireSPM();
    const { month, year } = periodActionSchema.parse(await readJson(req));
    const result = await calculateMonthlyRating(month, year, spm.id);
    return jsonOk(result);
  } catch (e) {
    return handleError(e);
  }
}
