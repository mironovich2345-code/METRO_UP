import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { replaceDocumentFile } from "@/lib/server/metric/documents-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST — replace the file of a DRAFT document (multipart). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "file_required");
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await replaceDocumentFile(admin.id, id, { buffer, filename: file.name, mimeType: file.type || "application/octet-stream" });
    return jsonOk({ document });
  } catch (e) {
    return handleError(e);
  }
}
