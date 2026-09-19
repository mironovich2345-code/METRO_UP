import type { NextRequest } from "next/server";
import { requireFullAccess, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeScriptBySlug, canAccessScripts } from "@/lib/server/knowledge-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scripts are not on the approved LIMITED whitelist — requires FULL access. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireFullAccess();
    if (!canAccessScripts(user.employeeProfile?.positionId)) {
      throw new AuthError(403, "forbidden", "Скрипты доступны менеджерам продаж");
    }
    const { slug } = await ctx.params;
    return jsonOk({ script: await getEmployeeScriptBySlug(slug) });
  } catch (e) {
    return handleError(e);
  }
}
