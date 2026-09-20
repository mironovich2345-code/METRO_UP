import type { NextRequest } from "next/server";
import { requireSystemAccess } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { mediaUploadSchema } from "@/lib/server/content-schemas";
import { createMediaUpload } from "@/lib/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — validate + create UPLOADING MediaAsset + short-lived signed PUT URL. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSystemAccess();
    const rl = await getRateLimiter().check(`media.upload:${admin.id}`, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });
    const input = mediaUploadSchema.parse(await readJson(req));
    const created = await createMediaUpload(admin.id, input);
    return jsonOk(created, 201);
  } catch (e) {
    return handleError(e);
  }
}
