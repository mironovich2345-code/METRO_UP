import { getCurrentUser } from "@/lib/server/session";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — the session user, or 401 when unauthenticated. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, "unauthorized");
    return jsonOk({ user: meDTO(user) });
  } catch (error) {
    return handleError(error);
  }
}
