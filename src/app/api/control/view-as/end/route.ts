import { requireUser } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { endViewAs } from "@/lib/server/rbac/view-as";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/control/view-as/end — clear the preview cookie. Audits VIEW_AS_ENDED. */
export async function POST() {
  try {
    const user = await requireUser();
    await endViewAs(user);
    return jsonOk({ ended: true });
  } catch (e) {
    return handleError(e);
  }
}
