import type { NextRequest } from "next/server";
import { requireClubManager } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { reorderClubTemplates } from "@/lib/server/club-plan";
import { templateReorderSchema } from "@/lib/server/club-plan-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const manager = await requireClubManager();
    const { ids } = templateReorderSchema.parse(await readJson(req));
    await reorderClubTemplates(manager, ids);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
