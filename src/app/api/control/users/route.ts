import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { userFilterSchema } from "@/lib/server/user-admin-schemas";
import { listUsers, getUserFacets } from "@/lib/server/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const filter = userFilterSchema.parse({
      cityId: url.searchParams.get("cityId") ?? undefined,
      clubId: url.searchParams.get("clubId") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      positionId: url.searchParams.get("positionId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    const [users, facets] = await Promise.all([listUsers(filter), getUserFacets()]);
    return jsonOk({ users, facets });
  } catch (e) {
    return handleError(e);
  }
}
