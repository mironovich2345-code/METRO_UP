import type { NextRequest } from "next/server";
import { requireClubManagerAccess } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { reorderClubTemplates } from "@/lib/server/club-plan";
import { templateReorderSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sprint: REMEDIATION R4, F-05 — gate swapped to requireClubManagerAccess
 * (see control/plan/route.ts's header comment). reorderClubTemplates ->
 * resolveScopedClubId (already grant-aware, unchanged) re-verifies the
 * requested clubId; only templates already owned by that club are
 * reordered (ownedSet filter), so a forged foreign template id is
 * silently dropped, never reordered.
 */
export async function POST(req: NextRequest) {
  try {
    const manager = await requireClubManagerAccess();
    const { ids } = templateReorderSchema.parse(await readJson(req));
    const clubId = req.nextUrl.searchParams.get("clubId");
    await reorderClubTemplates(manager, ids, clubId);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
