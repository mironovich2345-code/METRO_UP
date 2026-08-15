import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireEmployeeProfile, AuthError } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getMetricEnv, isMetricReady } from "@/lib/server/metric/env";
import { checkMetricRate } from "@/lib/server/metric/rate-limit";
import { metricChat } from "@/lib/server/metric/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(1, "Пустое сообщение").max(2000, "Слишком длинное сообщение"),
  conversationId: z.string().uuid().optional(),
});

/** POST — ask Metric. Feature-flag + rate-limit + Zod guarded; errors are safe. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireEmployeeProfile();
    if (!isMetricReady(getMetricEnv())) return jsonError(503, "metric_unavailable");

    const rate = checkMetricRate(user.id);
    if (!rate.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rate.retryAfterSeconds });

    const input = bodySchema.parse(await readJson(req));
    const result = await metricChat(user, input);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof AuthError) return handleError(e);
    if (e instanceof z.ZodError) return handleError(e);
    // OpenAI / transport / unexpected — never leak details.
    console.error("[metric] chat_failed");
    return jsonError(502, "ai_error");
  }
}
