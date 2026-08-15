import type { NextRequest } from "next/server";
import { requireEmployeeProfile } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getEmployeeDocument } from "@/lib/server/metric/documents-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — employee view of a PUBLISHED document (scope-checked, extracted text only). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireEmployeeProfile();
    const { id } = await ctx.params;
    return jsonOk({ document: await getEmployeeDocument(id, user.employeeProfile?.positionId ?? null) });
  } catch (e) {
    return handleError(e);
  }
}
