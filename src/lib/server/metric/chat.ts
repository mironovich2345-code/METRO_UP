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
import { httpTransport, MetricOpenAiError, type MetricTransport, type ChatMessage } from "./openai";
import { retrievalFilter, positionAllows } from "./access";
import { groupAllowedCitations, assembleSources } from "./source-map";
import { buildSystemInstructions, type EmployeeContext } from "./instructions";
import { classifyMode, needsRetrieval, nextRolePlayState, readRolePlayState, writeRolePlayState, rolePlayEqual } from "./mode";
import { MAX_SEARCH_RESULTS } from "./tuning";
import { getOrCreateActiveConversation, requireOwnConversation, getRecentMessages, appendMessages, extendAssistantMessage } from "./conversations";
import type { Prisma } from "@prisma/client";

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
  // Documents are attribution-only for employees — no employee-facing viewer.
  DOCUMENT: () => "",
};

/** Continuation instruction — the model resumes exactly where it stopped. */
export const CONTINUE_DIRECTIVE =
  "Продолжи предыдущий ответ с места, где он был остановлен. Не повторяй уже написанный текст и не добавляй вступление вроде «продолжаю». Заверши начатую мысль и оставшуюся часть ответа. Если слово было оборвано, начни с нового законченного предложения.";

/** Map OpenAI file citations back to our sources, re-checking access server-side. */
async function mapSources(citedFileIds: string[], position: EmployeePosition | null): Promise<MetricSourceDTO[]> {
  if (citedFileIds.length === 0) return [];
  // Fetch every cited record; the retrievable(SYNCED)+access filtering is pure and
  // unit-tested in source-map.ts, so a FAILED/PENDING source never becomes a card.
  const records = await prisma.knowledgeSyncRecord.findMany({ where: { openaiFileId: { in: citedFileIds } } });
  const byType = groupAllowedCitations(records, (scope) => positionAllows(position, scope));

  const [scripts, instructions, lessons, documents] = await Promise.all([
    byType.SCRIPT.length ? prisma.script.findMany({ where: { id: { in: byType.SCRIPT }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.INSTRUCTION.length ? prisma.workInstruction.findMany({ where: { id: { in: byType.INSTRUCTION }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.ACADEMY.length ? prisma.lesson.findMany({ where: { id: { in: byType.ACADEMY }, status: "PUBLISHED" }, select: { id: true, title: true, slug: true } }) : Promise.resolve([]),
    byType.DOCUMENT.length ? prisma.metricKnowledgeDocument.findMany({ where: { id: { in: byType.DOCUMENT }, status: "PUBLISHED" }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);

  return assembleSources(
    [
      { sourceType: "ACADEMY", rows: lessons },
      { sourceType: "SCRIPT", rows: scripts },
      { sourceType: "INSTRUCTION", rows: instructions },
      { sourceType: "DOCUMENT", rows: documents.map((d) => ({ id: d.id, title: d.title, slug: d.id })) },
    ],
    (t, slug) => HREF[t](slug),
  );
}

function contextFor(user: CurrentUser): EmployeeContext {
  const p = user.employeeProfile;
  return {
    displayName: user.displayName,
    roleTitle: ROLE_LABEL[user.role] ?? "Сотрудник",
    positionTitle: getPositionById(p?.positionId)?.title ?? null,
    cityName: getCityById(p?.cityId)?.name ?? null,
    clubName: getClubById(p?.clubId)?.name ?? null,
    scriptsAllowed: canAccessScripts(p?.positionId),
  };
}

/**
 * One Metric turn. A light server-side heuristic + the conversation's role-play
 * state pick the mode (no extra LLM call); the mode drives the prompt and whether
 * file_search runs. Grounding, position access and history are unchanged. When
 * `onDelta` is provided the answer streams; otherwise it is returned whole. The
 * final answer is persisted exactly once.
 */
async function runTurn(
  user: CurrentUser,
  input: { text: string; conversationId?: string },
  deps: ChatDeps,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<MetricChatResultDTO> {
  const t0 = Date.now();
  const env = deps.env ?? getMetricEnv();
  if (!isMetricReady(env)) throw new AuthError(503, "metric_unavailable", "Метрик временно недоступен");
  const profile = user.employeeProfile;
  if (!profile) throw new AuthError(409, "onboarding_required");

  const position = profile.positionId;
  const conv = input.conversationId
    ? await requireOwnConversation(user.id, input.conversationId)
    : await getOrCreateActiveConversation(user.id);

  const rp = readRolePlayState(conv.state);
  const decision = classifyMode(input.text, rp);
  const useFileSearch = needsRetrieval(decision.mode, decision.transform);

  const history = await getRecentMessages(conv.id);
  const tCtx = Date.now();
  const messages: ChatMessage[] = [
    ...history.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: input.text },
  ];
  const instructions = buildSystemInstructions(contextFor(user), decision.mode, decision.detailed);

  const transport = deps.transport ?? httpTransport(env.apiKey!);
  const reqInput = {
    model: env.model,
    instructions,
    messages,
    vectorStoreId: env.vectorStoreId!,
    filters: useFileSearch ? retrievalFilter(position) : undefined,
    maxOutputTokens: env.maxOutputTokens,
    maxNumResults: MAX_SEARCH_RESULTS,
    useFileSearch,
  };

  const tReq = Date.now();
  let firstDeltaMs = 0;
  const result = onDelta
    ? await transport.streamResponse(reqInput, (txt) => { if (!firstDeltaMs) firstDeltaMs = Date.now() - tReq; onDelta(txt); }, signal)
    : await transport.createResponse(reqInput, signal);
  const tAI = Date.now();

  if (!result.text) throw new AuthError(502, "empty_response", "Пустой ответ");
  const sources = await mapSources(result.citedFileIds, position);

  // Safe retrieval diagnostics — mode, whether retrieval ran, how many citations
  // came back, and which source TYPES + titles were surfaced. No question text, no
  // chunk text, no document content, no PII, no key. Titles are corporate labels.
  if (useFileSearch) {
    const surfaced = sources.map((s) => `${s.sourceType}:${s.title.slice(0, 48)}`);
    console.info(`[metric] retrieval {mode:"${decision.mode}", used:true, citations:${result.citedFileIds.length}, sources:${JSON.stringify(surfaced)}}`);
  }

  // Persist role-play state only when it changed (start/exit).
  const nextRp = nextRolePlayState(decision.mode, rp);
  if (!rolePlayEqual(nextRp, rp)) {
    await prisma.metricConversation.update({
      where: { id: conv.id },
      data: { state: writeRolePlayState(conv.state, nextRp) as Prisma.InputJsonValue },
    });
  }

  const { assistantMsg } = await appendMessages(conv.id, input.text, {
    content: result.text,
    sources,
    openaiResponseId: result.responseId || null,
    isTruncated: result.truncated,
  });
  const tDone = Date.now();

  // Safe timing metrics — no question/answer text, no PII, no key, no prompt.
  console.info(`[metric] timing {mode:"${decision.mode}", retrieval:${useFileSearch}, firstDeltaMs:${firstDeltaMs || "-"}, openaiMs:${tAI - tReq}, ctxMs:${tCtx - t0}, persistMs:${tDone - tAI}, totalMs:${tDone - t0}, src:${sources.length}, trunc:${result.truncated}, historyCount:${history.length}, maxSearchResults:${useFileSearch ? MAX_SEARCH_RESULTS : 0}}`);

  return { conversationId: conv.id, message: assistantMsg, rolePlayActive: nextRp?.active ?? false };
}

export function metricChat(user: CurrentUser, input: { text: string; conversationId?: string }, deps: ChatDeps = {}): Promise<MetricChatResultDTO> {
  return runTurn(user, input, deps);
}

/**
 * Streaming variant — `onDelta` receives incremental text as it arrives.
 * `signal` aborts the upstream OpenAI request when the client disconnects, so a
 * request the user abandoned never keeps generating (and burning CPU) server-side.
 */
export function metricChatStream(
  user: CurrentUser,
  input: { text: string; conversationId?: string },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  deps: ChatDeps = {},
): Promise<MetricChatResultDTO> {
  return runTurn(user, input, deps, onDelta, signal);
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
  // Deterministic "last message" by seq (createdAt ties within a turn).
  const last = await prisma.metricMessage.findFirst({ where: { conversationId: conv.id }, orderBy: { seq: "desc" } });
  if (!last || last.role !== "ASSISTANT" || !last.isTruncated) {
    throw new AuthError(400, "nothing_to_continue", "Нечего продолжать");
  }
  const convPrefix = conv.id.slice(0, 8);
  const msgPrefix = last.id.slice(0, 8);

  const position = profile.positionId;
  const history = await getRecentMessages(conv.id);
  // Same file_search tool + position filter as the original turn → grounding and
  // access are preserved. History (incl. the truncated answer) gives the model
  // the original question, its own partial answer, and the retrieved context.
  const messages: ChatMessage[] = [
    ...history.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: CONTINUE_DIRECTIVE },
  ];

  const transport = deps.transport ?? httpTransport(env.apiKey!);
  let result;
  try {
    result = await transport.createResponse({
      model: env.model,
      instructions: buildSystemInstructions(contextFor(user)),
      messages,
      vectorStoreId: env.vectorStoreId!,
      filters: retrievalFilter(position),
      maxOutputTokens: env.maxOutputTokens,
      maxNumResults: MAX_SEARCH_RESULTS,
    });
  } catch (e) {
    // Safe diagnostics — no key/cookie/session/document/PII.
    const status = e instanceof MetricOpenAiError ? e.status : "?";
    console.error(`[metric] continue stage=openai status=${status} err=${e instanceof Error ? e.name : "unknown"} conv=${convPrefix} msg=${msgPrefix}`);
    throw e;
  }
  if (!result.text) {
    console.error(`[metric] continue stage=empty conv=${convPrefix} msg=${msgPrefix} out=${result.usage?.outputTokens ?? "?"}`);
    throw new AuthError(502, "empty_response", "Пустой ответ");
  }

  const sources = await mapSources(result.citedFileIds, position);
  const updated = await extendAssistantMessage(last.id, result.text, result.truncated, sources);
  console.info(`[metric] continue ok conv=${convPrefix} msg=${msgPrefix} trunc=${result.truncated} src=${sources.length}`);
  return { conversationId: conv.id, message: updated, rolePlayActive: readRolePlayState(conv.state)?.active ?? false };
}
