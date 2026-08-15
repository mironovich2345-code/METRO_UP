import "server-only";
import type { EmployeePosition } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import type { CurrentUser } from "../session";
import { canAccessScripts } from "@/lib/knowledge-access";
import { getPositionById } from "@/content/positions";
import { getCityById, getClubById } from "@/content/cities";
import type { MetricChatResultDTO, MetricSourceDTO, MetricSourceTypeDTO } from "@/lib/api/metric-types";
import { getMetricEnv, isMetricReady, type MetricEnv } from "./env";
import { httpTransport, type MetricTransport, type ChatMessage } from "./openai";
import { retrievalFilter, positionAllows, type PositionScope } from "./access";
import { buildSystemInstructions } from "./instructions";
import { getOrCreateActiveConversation, requireOwnConversation, getRecentMessages, appendMessages, extendAssistantMessage } from "./conversations";

/** Injected dependencies (real by default; a fake transport is used in tests). */
export interface ChatDeps {
  transport?: MetricTransport;
  env?: MetricEnv;
}

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: "Сотрудник", CLUB_MANAGER: "Управляющий клубом", SPM: "СПМ", ADMIN: "Администратор",
};

const HREF: Record<MetricSourceTypeDTO, (slugOrId: string) => string> = {
  ACADEMY: (s) => `/academy/lesson/${s}`,
  SCRIPT: (s) => `/scripts/${s}`,
  INSTRUCTION: (s) => `/instructions/${s}`,
  DOCUMENT: (id) => `/knowledge/documents/${id}`,
};

/** Continuation instruction — the model resumes exactly where it stopped. */
const CONTINUE_DIRECTIVE = "Продолжи предыдущий ответ с места остановки. Не повторяй уже сказанное.";

/** Map OpenAI file citations back to our sources, re-checking access server-side. */
async function mapSources(citedFileIds: string[], position: EmployeePosition | null): Promise<MetricSourceDTO[]> {
  if (citedFileIds.length === 0) return [];
  const records = await prisma.knowledgeSyncRecord.findMany({
    where: { openaiFileId: { in: citedFileIds }, status: "SYNCED" },
  });
  const allowed = records.filter((r) => positionAllows(position, r.positionScope as PositionScope));

  const byType: Record<MetricSourceTypeDTO, string[]> = { ACADEMY: [], SCRIPT: [], INSTRUCTION: [], DOCUMENT: [] };
  for (const r of allowed) byType[r.sourceType as MetricSourceTypeDTO].push(r.sourceId);

  const [scripts, instructions, lessons, documents] = await Promise.all([
    byType.SCRIPT.length ? prisma.script.findMany({ where: { id: { in: byType.SCRIPT }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.INSTRUCTION.length ? prisma.workInstruction.findMany({ where: { id: { in: byType.INSTRUCTION }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.ACADEMY.length ? prisma.lesson.findMany({ where: { id: { in: byType.ACADEMY }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.DOCUMENT.length ? prisma.metricKnowledgeDocument.findMany({ where: { id: { in: byType.DOCUMENT }, status: "PUBLISHED" }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);

  const out: MetricSourceDTO[] = [];
  const seen = new Set<string>();
  const add = (t: MetricSourceTypeDTO, rows: { id: string; title: string; slug: string }[]) => {
    for (const row of rows) {
      const key = `${t}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sourceType: t, title: row.title, href: HREF[t](row.slug) });
    }
  };
  add("ACADEMY", lessons);
  add("SCRIPT", scripts);
  add("INSTRUCTION", instructions);
  add("DOCUMENT", documents.map((d) => ({ id: d.id, title: d.title, slug: d.id })));
  return out.slice(0, 4);
}

function instructionsFor(user: CurrentUser): string {
  const p = user.employeeProfile;
  return buildSystemInstructions({
    displayName: user.displayName,
    roleTitle: ROLE_LABEL[user.role] ?? "Сотрудник",
    positionTitle: getPositionById(p?.positionId)?.title ?? null,
    cityName: getCityById(p?.cityId)?.name ?? null,
    clubName: getClubById(p?.clubId)?.name ?? null,
    scriptsAllowed: canAccessScripts(p?.positionId),
  });
}

/**
 * Answer one employee message. Server is the source of truth for history, model,
 * access filtering and sources. Throws AuthError on config/transport problems so
 * the route can return a safe, user-friendly message.
 */
export async function metricChat(user: CurrentUser, input: { text: string; conversationId?: string }, deps: ChatDeps = {}): Promise<MetricChatResultDTO> {
  const env = deps.env ?? getMetricEnv();
  if (!isMetricReady(env)) throw new AuthError(503, "metric_unavailable", "Метрик временно недоступен");
  const profile = user.employeeProfile;
  if (!profile) throw new AuthError(409, "onboarding_required");

  const position = profile.positionId;
  const conv = input.conversationId
    ? await requireOwnConversation(user.id, input.conversationId)
    : await getOrCreateActiveConversation(user.id);

  const history = await getRecentMessages(conv.id);
  const messages: ChatMessage[] = [
    ...history.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: input.text },
  ];

  const instructions = instructionsFor(user);

  const transport = deps.transport ?? httpTransport(env.apiKey!);
  const result = await transport.createResponse({
    model: env.model,
    instructions,
    messages,
    vectorStoreId: env.vectorStoreId!,
    filters: retrievalFilter(position),
    maxOutputTokens: env.maxOutputTokens,
  });

  if (!result.text) throw new AuthError(502, "empty_response", "Пустой ответ");
  const sources = await mapSources(result.citedFileIds, position);

  const { assistantMsg } = await appendMessages(conv.id, input.text, {
    content: result.text,
    sources,
    openaiResponseId: result.responseId || null,
    isTruncated: result.truncated,
  });

  // Non-sensitive observability (no key, no prompt, no PII).
  console.info(`[metric] ok conv=${conv.id.slice(0, 8)} in=${result.usage?.inputTokens ?? "?"} out=${result.usage?.outputTokens ?? "?"} src=${sources.length} trunc=${result.truncated}`);

  return { conversationId: conv.id, message: assistantMsg };
}

/**
 * Continue a previously truncated answer. Only valid when the conversation's
 * last message is a truncated ASSISTANT message that belongs to this user. The
 * continuation directive is ephemeral (not stored as a user turn); the new text
 * is appended to the same assistant message, so nothing is duplicated.
 */
export async function continueMetric(user: CurrentUser, conversationId: string, deps: ChatDeps = {}): Promise<MetricChatResultDTO> {
  const env = deps.env ?? getMetricEnv();
  if (!isMetricReady(env)) throw new AuthError(503, "metric_unavailable", "Метрик временно недоступен");
  const profile = user.employeeProfile;
  if (!profile) throw new AuthError(409, "onboarding_required");

  const conv = await requireOwnConversation(user.id, conversationId);
  const last = await prisma.metricMessage.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" } });
  if (!last || last.role !== "ASSISTANT" || !last.isTruncated) {
    throw new AuthError(400, "nothing_to_continue", "Нечего продолжать");
  }

  const position = profile.positionId;
  const history = await getRecentMessages(conv.id);
  const messages: ChatMessage[] = [
    ...history.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: CONTINUE_DIRECTIVE },
  ];

  const transport = deps.transport ?? httpTransport(env.apiKey!);
  const result = await transport.createResponse({
    model: env.model,
    instructions: instructionsFor(user),
    messages,
    vectorStoreId: env.vectorStoreId!,
    filters: retrievalFilter(position),
    maxOutputTokens: env.maxOutputTokens,
  });
  if (!result.text) throw new AuthError(502, "empty_response", "Пустой ответ");

  const sources = await mapSources(result.citedFileIds, position);
  const updated = await extendAssistantMessage(last.id, result.text, result.truncated, sources);
  return { conversationId: conv.id, message: updated };
}
