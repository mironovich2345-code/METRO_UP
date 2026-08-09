import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/authz";
import { jsonOk, handleError, readJson } from "@/lib/server/http";
import { mediaCompleteSchema } from "@/lib/server/content-schemas";
import { completeMediaUpload } from "@/lib/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — verify the uploaded object exists (headObject) and flip to READY. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const hints = mediaCompleteSchema.parse(await readJson(req));
    const asset = await completeMediaUpload(admin.id, id, hints);
    return jsonOk({ media: asset });
  } catch (e) {
    return handleError(e);
  }
}
