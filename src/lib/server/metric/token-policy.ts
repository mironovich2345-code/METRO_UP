/**
 * Output-token policy (pure — unit testable; no server-only import).
 *
 * This is a MAX, not a target length. Compact, finished answers are enforced by
 * the system prompt; the max only gives normal answers room to complete and lets
 * rare long answers finish (or offer «Продолжить»). Retrieval chunks and history
 * are unchanged — only the completion budget is.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2500;
export const MAX_OUTPUT_CEILING = 4000;

export function resolveMaxOutputTokens(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(MAX_OUTPUT_CEILING, Math.floor(n));
}
