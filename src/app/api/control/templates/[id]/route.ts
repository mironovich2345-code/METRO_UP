import type { NextRequest } from "next/server";
import { requireClubManagerAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { updateClubTemplate } from "@/lib/server/club-plan";
import { templateUpdateSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — edit / enable-disable a club template (own club only). Sprint:
 * REMEDIATION R4, F-05 — gate swapped to requireClubManagerAccess (see
 * control/plan/route.ts's header comment). updateClubTemplate ->
 * assertOwnTemplate -> resolveScopedClubId (already grant-aware,
 * unchanged) re-verifies the requested clubId, then the template's own
 * clubId is compared against it — a foreign template id still 403s.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireClubManagerAccess();
    const { id } = await ctx.params;
    const input = templateUpdateSchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    const template = await updateClubTemplate(manager, id, input, clubId);
    return jsonOk({ template });
  } catch (e) {
    return handleError(e);
  }
}
