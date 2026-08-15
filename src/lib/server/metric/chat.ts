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
import { getOrCreateActiveConversation, requireOwnConversation, getRecentMessages, appendMessages } from "./conversations";

/** Injected dependencies (real by default; a fake transport is used in tests). */
export interface ChatDeps {
  transport?: MetricTransport;
  env?: MetricEnv;
}

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: "Сотрудник", CLUB_MANAGER: "Управляющий клубом", SPM: "СПМ", ADMIN: "Администратор",
};

const HREF: Record<MetricSourceTypeDTO, (slug: string) => string> = {
  ACADEMY: (s) => `/academy/lesson/${s}`,
  SCRIPT: (s) => `/scripts/${s}`,
  INSTRUCTION: (s) => `/instructions/${s}`,
};

/** Map OpenAI file citations back to our sources, re-checking access server-side. */
async function mapSources(citedFileIds: string[], position: EmployeePosition | null): Promise<MetricSourceDTO[]> {
  if (citedFileIds.length === 0) return [];
  const records = await prisma.knowledgeSyncRecord.findMany({
    where: { openaiFileId: { in: citedFileIds }, status: "SYNCED" },
  });
  const allowed = records.filter((r) => positionAllows(position, r.positionScope as PositionScope));

  const byType: Record<MetricSourceTypeDTO, string[]> = { ACADEMY: [], SCRIPT: [], INSTRUCTION: [] };
  for (const r of allowed) byType[r.sourceType as MetricSourceTypeDTO].push(r.sourceId);

  const [scripts, instructions, lessons] = await Promise.all([
    byType.SCRIPT.length ? prisma.script.findMany({ where: { id: { in: byType.SCRIPT }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.INSTRUCTION.length ? prisma.workInstruction.findMany({ where: { id: { in: byType.INSTRUCTION }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.ACADEMY.length ? prisma.lesson.findMany({ where: { id: { in: byType.ACADEMY }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
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
  return out.slice(0, 4);
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

  const instructions = buildSystemInstructions({
    displayName: user.displayName,
    roleTitle: ROLE_LABEL[user.role] ?? "Сотрудник",
    positionTitle: getPositionById(position)?.title ?? null,
    cityName: getCityById(profile.cityId)?.name ?? null,
    clubName: getClubById(profile.clubId)?.name ?? null,
    scriptsAllowed: canAccessScripts(position),
  });

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
  });

  // Non-sensitive observability (no key, no prompt, no PII).
  console.info(`[metric] ok conv=${conv.id.slice(0, 8)} in=${result.usage?.inputTokens ?? "?"} out=${result.usage?.outputTokens ?? "?"} src=${sources.length}`);

  return { conversationId: conv.id, message: assistantMsg };
}
