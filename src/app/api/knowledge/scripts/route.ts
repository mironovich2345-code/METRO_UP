import { requireFullAccess, AuthError } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeScripts, canAccessScripts } from "@/lib/server/knowledge-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scripts are not on the approved LIMITED whitelist — requires FULL access. */
export async function GET() {
  try {
    const user = await requireFullAccess();
    if (!canAccessScripts(user.employeeProfile?.positionId)) {
      throw new AuthError(403, "forbidden", "Скрипты доступны менеджерам продаж");
    }
    return jsonOk(await getEmployeeScripts());
  } catch (e) {
    return handleError(e);
  }
}
