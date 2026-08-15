import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireEmployeeProfile, AuthError } from "@/lib/server/authz";
import { jsonError, handleError, readJson } from "@/lib/server/http";
import { getMetricEnv, isMetricReady } from "@/lib/server/metric/env";
import { checkMetricRate } from "@/lib/server/metric/rate-limit";
import { metricChatStream } from "@/lib/server/metric/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(1, "Пустое сообщение").max(2000, "Слишком длинное сообщение"),
  conversationId: z.string().uuid().optional(),
});

/**
 * POST — ask Metric. Streams the answer as Server-Sent Events. The final answer
 * is persisted server-side exactly once (even if the client disconnects). The
 * OpenAI key never leaves the server.
 */
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireEmployeeProfile>>;
  let input: z.infer<typeof bodySchema>;
  try {
    user = await requireEmployeeProfile();
    if (!isMetricReady(getMetricEnv())) return jsonError(503, "metric_unavailable");
    const rate = checkMetricRate(user.id);
    if (!rate.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rate.retryAfterSeconds });
    input = bodySchema.parse(await readJson(req));
  } catch (e) {
    if (e instanceof AuthError || e instanceof z.ZodError) return handleError(e);
    return jsonError(500, "internal_error");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone — server still finishes + persists */ }
      };
      try {
        const result = await metricChatStream(user, input, (text) => send({ type: "delta", text }));
        send({ type: "done", conversationId: result.conversationId, message: result.message, rolePlayActive: result.rolePlayActive });
      } catch (e) {
        const code = e instanceof AuthError ? e.code : "ai_error";
        console.error(`[metric] chat_failed ${code}`);
        send({ type: "error", code });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
