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
  // Order by the monotonic seq (createdAt ties within a turn) → correct
  // user→assistant order and a stable "last message".
  const rows = await prisma.metricMessage.findMany({
    where: { conversationId },
    orderBy: { seq: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export function toMessageDTO(m: {
  id: string; role: "USER" | "ASSISTANT"; content: string; sources: unknown; isTruncated: boolean; createdAt: Date;
}): MetricMessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    sources: Array.isArray(m.sources) ? (m.sources as MetricSourceDTO[]) : [],
    isTruncated: m.isTruncated,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function appendMessages(
  conversationId: string,
  userText: string,
  assistant: { content: string; sources: MetricSourceDTO[]; openaiResponseId: string | null; isTruncated: boolean },
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
        isTruncated: assistant.isTruncated,
      },
    }),
  ]);
  await prisma.metricConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return { userMsg: toMessageDTO(userMsg), assistantMsg: toMessageDTO(assistantMsg) };
}

/** Append continuation text to an existing assistant message (no duplicate turn). */
export async function extendAssistantMessage(
  messageId: string,
  moreText: string,
  isTruncated: boolean,
  extraSources: MetricSourceDTO[],
): Promise<MetricMessageDTO> {
  const existing = await prisma.metricMessage.findUnique({ where: { id: messageId } });
  if (!existing) throw new AuthError(404, "message_not_found");
  const prevSources = Array.isArray(existing.sources) ? (existing.sources as unknown as MetricSourceDTO[]) : [];
  const mergedSources = [...prevSources];
  const seen = new Set(prevSources.map((s) => s.href));
  for (const s of extraSources) if (!seen.has(s.href)) { seen.add(s.href); mergedSources.push(s); }
  const updated = await prisma.metricMessage.update({
    where: { id: messageId },
    data: {
      content: `${existing.content} ${moreText}`.trim(),
      isTruncated,
      sources: mergedSources as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.metricConversation.update({ where: { id: existing.conversationId }, data: { updatedAt: new Date() } });
  return toMessageDTO(updated);
}
