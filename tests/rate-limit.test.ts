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
    "control/roles create/revoke/restore (30/min per acting user), " +
    "admin/media/upload, and control/metric/documents upload — metric/chat and " +
    "metric/chat/continue keep their existing, separate, already-tested " +
    "per-user in-memory limiter (metric/rate-limit.ts) unchanged",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
