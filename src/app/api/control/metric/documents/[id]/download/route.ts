import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { getDocumentDownloadUrl } from "@/lib/server/metric/documents-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — a short-lived signed URL for the ADMIN to download the original file. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ url: await getDocumentDownloadUrl(id) });
  } catch (e) {
    return handleError(e);
  }
}
