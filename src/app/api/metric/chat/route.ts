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

  // One controller aborts the upstream OpenAI request the moment the client goes
  // away — whether the browser aborts the request (req.signal) or the response
  // stream is cancelled (cancel()). Without this, an abandoned request keeps
  // generating server-side and pegs the CPU.
  const ac = new AbortController();
  const abort = () => ac.abort();
  if (req.signal.aborted) ac.abort();
  else req.signal.addEventListener("abort", abort, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone — enqueue on a closed stream */ }
      };
      try {
        const result = await metricChatStream(user, input, (text) => send({ type: "delta", text }), ac.signal);
        send({ type: "done", conversationId: result.conversationId, message: result.message, rolePlayActive: result.rolePlayActive });
      } catch (e) {
        // AbortError on client disconnect is expected — not a server fault.
        const code = e instanceof AuthError ? e.code : ac.signal.aborted ? "aborted" : "ai_error";
        if (code !== "aborted") console.error(`[metric] chat_failed ${code}`);
        send({ type: "error", code });
      } finally {
        req.signal.removeEventListener("abort", abort);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    // Fired when the consumer cancels the SSE response (e.g. client disconnect).
    cancel() { ac.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
