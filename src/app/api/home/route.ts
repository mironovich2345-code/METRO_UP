import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getHomeDashboard } from "@/lib/server/home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/home — aggregated production dashboard for the current user. */
export async function GET() {
  try {
    const user = await requireUser();
    const data = await getHomeDashboard(user);
    return jsonOk(data);
  } catch (e) {
    return handleError(e);
  }
}
