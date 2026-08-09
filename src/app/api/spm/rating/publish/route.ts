import type { NextRequest } from "next/server";
import { requireSPM } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { publishRating } from "@/lib/server/rating-publish";
import { periodActionSchema } from "@/lib/server/spm-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — publish a READY period; employees then see the rating. Idempotent. */
export async function POST(req: NextRequest) {
  try {
    const spm = await requireSPM();
    const { month, year } = periodActionSchema.parse(await readJson(req));
    const period = await publishRating(month, year, spm.id);
    return jsonOk({ period });
  } catch (e) {
    return handleError(e);
  }
}
