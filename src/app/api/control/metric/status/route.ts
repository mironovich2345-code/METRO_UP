import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getMetricStatus } from "@/lib/server/metric/knowledge-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — ADMIN read-only Metric knowledge sync status. */
export async function GET() {
  try {
    await requireSystemAccess();
    return jsonOk(await getMetricStatus());
  } catch (e) {
    return handleError(e);
  }
}
