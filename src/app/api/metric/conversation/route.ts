import { requireEmployeeProfile } from "@/lib/server/authz";
import { jsonOk, handleError } from "@/lib/server/http";
import { prisma } from "@/lib/server/db";
import { getMetricEnv, isMetricReady } from "@/lib/server/metric/env";
import { toMessageDTO } from "@/lib/server/metric/conversations";
import type { MetricConversationDTO } from "@/lib/api/metric-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the current user's latest conversation (own only). Never creates one. */
export async function GET() {
  try {
    const user = await requireEmployeeProfile();
    const ready = isMetricReady(getMetricEnv());
    const conv = await prisma.metricConversation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
    });
    const payload: MetricConversationDTO = {
      conversationId: conv?.id ?? null,
      messages: (conv?.messages ?? []).map(toMessageDTO),
      ready,
    };
    return jsonOk(payload);
  } catch (e) {
    return handleError(e);
  }
}
