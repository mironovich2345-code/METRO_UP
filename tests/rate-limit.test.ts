import { test } from "node:test";

/**
 * Durable rate limiter (Sprint 1 / Phase 2B) — src/lib/server/rate-limit.ts,
 * backed by the rate_limit_hits table (prisma/migrations/
 * 20260817000300_rate_limit_hits). Replaces the previous in-memory
 * permissiveLimiter, which always returned {allowed: true} and reset on
 * every restart/redeploy. The window-bucketing math itself is a few lines
 * embedded in one Prisma upsert (not factored into a separately-testable
 * pure function, unlike metric/rate-limit.ts's checkMetricRate) — every
 * scenario below needs a live Postgres connection to exercise for real.
 */

test(
  "RL-A: getRateLimiter().check(key) with no prior hits in the current window " +
    "returns {allowed: true}; the (key, windowStart) row is created with count=1",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "RL-B: N+1 calls with the same key inside one window (N = the caller's max) " +
    "-> the (N+1)th returns {allowed: false, retryAfterSeconds > 0}; a call with " +
    "a DIFFERENT key in the same window is unaffected",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "RL-C: two concurrent check() calls for the same (key, window) both increment " +
    "correctly (Postgres upsert + increment is atomic at the row level) — no lost " +
    "update, unlike a naive findFirst-then-create/update",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "RL-D: after the window rolls over, the same key is allowed again (a fresh " +
    "(key, newWindowStart) row, independent of the previous window's count)",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "RL-E: a rate_limit_hits write failure (e.g. connection drop) fails OPEN — " +
    "check() returns {allowed: true} rather than blocking auth/onboarding/role " +
    "management on the limiter's own dependency health",
  { skip: "integration: requires Postgres (failure injection)" },
  () => {},
);

test(
  "RL-F: durable limits are now enforced (a real 429, not always-allowed) on " +
    "auth/telegram, auth/telegram-web, profile/onboarding (10/min per user), " +
    "control/roles create/revoke/restore (30/min per acting user), and " +
    "admin/media/upload + control/metric/documents upload (20/min per user each)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

/* -------- Metric chat (Sprint 1 / Phase 2C, Blocker #2) ------------------- */
/*
 * metric/rate-limit.ts (the in-memory per-instance checkMetricRate(), tested
 * as "L" in tests/metric.test.ts) is REMOVED this phase — /api/metric/chat
 * and /chat/continue now call the SAME durable getRateLimiter() as every
 * other rate-limited route, with metric/tuning.ts's METRIC_RATE_MAX=10 /
 * METRIC_RATE_WINDOW_MS=60_000 (unchanged values, new backend).
 */

test(
  "RL-G: 10 requests within 60s for one userId to /api/metric/chat succeed; the " +
    "11th returns 429 rate_limited with retryAfterSeconds > 0; a DIFFERENT " +
    "userId is unaffected (separate key, metric.chat:<userId>); a request in the " +
    "NEXT window is allowed again",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "RL-H: /api/metric/chat and /api/metric/chat/continue for the SAME user SHARE " +
    "one 10/60s budget (both key on metric.chat:<userId> — this matches the " +
    "removed in-memory limiter's own behavior, which keyed purely on userId with " +
    "no per-route split; splitting them would double effective throughput, not " +
    "asked for)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "RL-I: the rate check runs BEFORE the request body is parsed and BEFORE " +
    "metricChatStream()/continueMetric() are called — a rejected (429) request " +
    "never reaches OpenAI; SSE streaming for an ALLOWED request is unaffected " +
    "(the check is a single fast DB round-trip ahead of the stream, not inside it)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
