import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { mediaUploadSchema } from "@/lib/server/content-schemas";
import { createMediaUpload } from "@/lib/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — validate + create UPLOADING MediaAsset + short-lived signed PUT URL. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const input = mediaUploadSchema.parse(await readJson(req));
    const created = await createMediaUpload(admin.id, input);
    return jsonOk(created, 201);
  } catch (e) {
    return handleError(e);
  }
}
