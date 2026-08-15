import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { createClubTemplate } from "@/lib/server/club-plan";
import { templateCreateSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — create a recurring club task template (own club, server-scoped). */
export async function POST(req: NextRequest) {
  try {
    const manager = await requireClubManager();
    const input = templateCreateSchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    const template = await createClubTemplate(manager, input, clubId);
    return jsonOk({ template }, 201);
  } catch (e) {
    return handleError(e);
  }
}
