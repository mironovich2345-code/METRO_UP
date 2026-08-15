import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { publishDocument } from "@/lib/server/metric/documents-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ document: await publishDocument(admin.id, id) });
  } catch (e) {
    return handleError(e);
  }
}
