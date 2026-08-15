import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { listDocuments, createDocument } from "@/lib/server/metric/documents-admin";
import { metaSchema } from "@/lib/server/metric/document-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listDocuments());
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(400, "file_required");
    const meta = metaSchema.parse({
      title: form.get("title"),
      category: form.get("category"),
      description: form.get("description") || undefined,
      positionScope: form.get("positionScope") || "ALL",
      versionLabel: form.get("versionLabel") || undefined,
      effectiveFrom: form.get("effectiveFrom") || undefined,
      effectiveTo: form.get("effectiveTo") || undefined,
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await createDocument(admin.id, meta, { buffer, filename: file.name, mimeType: file.type || "application/octet-stream" });
    return jsonOk({ document }, 201);
  } catch (e) {
    return handleError(e);
  }
}
