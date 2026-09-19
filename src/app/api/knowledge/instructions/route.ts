import { requireFullAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeInstructions } from "@/lib/server/knowledge-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Instructions are not on the approved LIMITED whitelist — requires FULL access. */
export async function GET() {
  try {
    await requireFullAccess();
    return jsonOk(await getEmployeeInstructions());
  } catch (e) {
    return handleError(e);
  }
}
