import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireFullAccess, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getMetricEnv, isMetricReady } from "@/lib/server/metric/env";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { continueMetric } from "@/lib/server/metric/chat";
import { METRIC_RATE_MAX, METRIC_RATE_WINDOW_MS } from "@/lib/server/metric/tuning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ conversationId: z.string().uuid() });

/**
 * POST — continue the last truncated answer of the user's own conversation.
 * Metric requires FULL access (see requireFullAccess).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireFullAccess();
    if (!isMetricReady(getMetricEnv())) return jsonError(503, "metric_unavailable");
    // Same key as /api/metric/chat, deliberately — the original in-memory
    // checkMetricRate() keyed purely by userId, with no per-route split, so
    // chat and chat/continue always shared one 10/60s budget. Splitting them
    // into independent buckets here would double a user's effective
    // throughput, a behavior change nothing asked for.
    const rate = await getRateLimiter().check(`metric.chat:${user.id}`, { max: METRIC_RATE_MAX, windowMs: METRIC_RATE_WINDOW_MS });
    if (!rate.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rate.retryAfterSeconds });
    const { conversationId } = bodySchema.parse(await readJson(req));
    return jsonOk(await continueMetric(user, conversationId));
  } catch (e) {
    if (e instanceof AuthError) return handleError(e);
    if (e instanceof z.ZodError) return handleError(e);
    console.error("[metric] continue_failed");
    return jsonError(502, "ai_error");
  }
}
