import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { getDocument, updateDocumentMeta } from "@/lib/server/metric/documents-admin";
import { metaSchema } from "@/lib/server/metric/document-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    return jsonOk({ document: await getDocument(id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const input = metaSchema.partial().parse(await readJson(req));
    return jsonOk({ document: await updateDocumentMeta(admin.id, id, input) });
  } catch (e) {
    return handleError(e);
  }
}
