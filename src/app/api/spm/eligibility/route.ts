import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { setEligibility } from "@/lib/server/eligibility";
import { eligibilitySchema } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — include/exclude an employee from a period's rating. */
export async function POST(req: NextRequest) {
  try {
    const spm = await requireSPM();
    const input = eligibilitySchema.parse(await readJson(req));
    const row = await setEligibility(spm.id, input);
    return jsonOk({ row });
  } catch (e) {
    return handleError(e);
  }
}
