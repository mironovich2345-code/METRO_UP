/**
 * Benchmark configuration for the Metric latency audit (pure — no server-only, no
 * network, no secrets). This module is imported ONLY by the standalone bench
 * runner (scripts/metric-bench.ts); it is never referenced by any route or by the
 * live chat flow, so it cannot change production behaviour or defaults.
 */

/** History-window sizes to compare (production default is 12). */
export const HISTORY_VARIANTS = [12, 6, 4, 2] as const;

/** file_search result counts to compare (production default is 6). */
export const RETRIEVAL_VARIANTS = [6, 4, 3] as const;

export interface SmokeItem {
  id: string;
  /** The user message. */
  text: string;
  /** Expected routed mode (for reading the results, not enforced). */
  expectMode: "ANSWER" | "ASSIST" | "ROLE_PLAY" | "ROLE_PLAY_START";
  /** When true, the item only makes sense with prior context (tests history). */
  followUp?: boolean;
}

/**
 * Fixed smoke set from the sprint. Deterministic so runs are comparable. Item 5 is
 * a context-dependent follow-up; item 6 is a role-play client turn (no retrieval).
 */
export const SMOKE_SET: SmokeItem[] = [
  { id: "1-card", text: "Что входит в клубную карту?", expectMode: "ANSWER" },
  { id: "2-appearance", text: "Какой должен быть внешний вид менеджера?", expectMode: "ANSWER" },
  { id: "3-expensive", text: "Клиент говорит, что дорого. Что ответить?", expectMode: "ASSIST" },
  { id: "4-refund", text: "Как оформить возврат?", expectMode: "ANSWER" },
  { id: "5-shorten", text: "А как это сказать клиенту коротко?", expectMode: "ASSIST", followUp: true },
  { id: "6-roleplay-turn", text: "Мне это дорого, я подумаю.", expectMode: "ROLE_PLAY" },
];

/** Keep only the last `keep` messages — the same tail semantics as production. */
export function sliceHistory<T>(messages: T[], keep: number): T[] {
  if (keep <= 0) return [];
  return messages.length <= keep ? messages.slice() : messages.slice(messages.length - keep);
}

/** Very rough RU/EN token estimate (~3.3 chars/token) — for offline sizing only. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 3.3);
}
