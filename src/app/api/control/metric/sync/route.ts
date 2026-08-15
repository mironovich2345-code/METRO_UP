import { requireAdmin, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { getMetricEnv } from "@/lib/server/metric/env";
import { httpTransport } from "@/lib/server/metric/openai";
import { fullSync } from "@/lib/server/metric/knowledge-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST — ADMIN full knowledge re-sync. Needs an API key + a vector store id. */
export async function POST() {
  try {
    await requireAdmin();
    const env = getMetricEnv();
    if (!env.apiKey) return jsonError(409, "no_api_key");
    if (!env.vectorStoreId) return jsonError(409, "no_vector_store");
    const result = await fullSync({ transport: httpTransport(env.apiKey), vectorStoreId: env.vectorStoreId });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof AuthError) return handleError(e);
    console.error("[metric] sync_failed");
    return jsonError(502, "sync_error");
  }
}
