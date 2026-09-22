/**
 * Metric latency/quality tuning knobs (pure — no server-only, unit testable).
 * These are the presentation-latency defaults; changing them here changes both
 * the chat flow and the diagnostics, and is covered by tests. Access filters,
 * model, streaming and the output-token ceiling are intentionally NOT here.
 */

/**
 * How many recent conversation messages are sent as model context. 6 = the last
 * three exchanges — enough for follow-ups like «а как это сказать клиенту
 * коротко?» while cutting input tokens vs the previous 12.
 */
export const HISTORY_LIMIT = 6;

/**
 * file_search `max_num_results`. 4 (down from 6) trims the tool-result payload and
 * the model's second pass while keeping a safety margin for the harder
 * DOCUMENT/Instruction retrieval cases. Drop to 3 only after the retrieval
 * regression set (see the sprint report) passes on production data.
 */
export const MAX_SEARCH_RESULTS = 4;

/**
 * Sprint 1 / Phase 2C — Metric's per-user rate limit, enforced via the
 * durable (Postgres-backed) getRateLimiter() in both /api/metric/chat and
 * /chat/continue. Same 10 requests / 60 seconds the previous in-memory
 * per-instance limiter (removed this phase) used — no stated reason to
 * change the number, only the backend it's checked against.
 */
export const METRIC_RATE_MAX = 10;
export const METRIC_RATE_WINDOW_MS = 60_000;
