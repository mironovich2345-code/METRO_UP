import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireEmployeeProfile, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getMetricEnv, isMetricReady } from "@/lib/server/metric/env";
import { checkMetricRate } from "@/lib/server/metric/rate-limit";
import { continueMetric } from "@/lib/server/metric/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ conversationId: z.string().uuid() });

/** POST — continue the last truncated answer of the user's own conversation. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireEmployeeProfile();
    if (!isMetricReady(getMetricEnv())) return jsonError(503, "metric_unavailable");
    const rate = checkMetricRate(user.id);
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
