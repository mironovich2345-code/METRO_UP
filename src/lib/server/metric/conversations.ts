import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import type { MetricSourceDTO, MetricMessageDTO } from "@/lib/api/metric-types";

/** Conversations are strictly scoped to their owning user. */
const HISTORY_LIMIT = 12; // last N messages sent as model context (cost control)

export async function getOrCreateActiveConversation(userId: string) {
  const latest = await prisma.metricConversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return latest ?? prisma.metricConversation.create({ data: { userId } });
}

/** Load a conversation only if it belongs to the user (else 404 — no leakage). */
export async function requireOwnConversation(userId: string, conversationId: string) {
  const conv = await prisma.metricConversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.userId !== userId) throw new AuthError(404, "conversation_not_found");
  return conv;
}

export async function getRecentMessages(conversationId: string, limit = HISTORY_LIMIT) {
  const rows = await prisma.metricMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export function toMessageDTO(m: {
  id: string; role: "USER" | "ASSISTANT"; content: string; sources: unknown; createdAt: Date;
}): MetricMessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    sources: Array.isArray(m.sources) ? (m.sources as MetricSourceDTO[]) : [],
    createdAt: m.createdAt.toISOString(),
  };
}

export async function appendMessages(
  conversationId: string,
  userText: string,
  assistant: { content: string; sources: MetricSourceDTO[]; openaiResponseId: string | null },
): Promise<{ userMsg: MetricMessageDTO; assistantMsg: MetricMessageDTO }> {
  const [userMsg, assistantMsg] = await prisma.$transaction([
    prisma.metricMessage.create({ data: { conversationId, role: "USER", content: userText } }),
    prisma.metricMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: assistant.content,
        sources: assistant.sources as unknown as Prisma.InputJsonValue,
        openaiResponseId: assistant.openaiResponseId,
      },
    }),
  ]);
  await prisma.metricConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return { userMsg: toMessageDTO(userMsg), assistantMsg: toMessageDTO(assistantMsg) };
}
