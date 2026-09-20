import "server-only";
import { prisma } from "./db";

/**
 * Durable, fixed-window rate limiter (Sprint 1 / Phase 2B), backed by the
 * `rate_limit_hits` table (prisma/migrations/20260817000300_rate_limit_hits)
 * — replaces the previous in-memory permissiveLimiter placeholder, which
 * allowed every request unconditionally and reset on every restart/redeploy
 * and did not share state across horizontally-scaled instances.
 *
 * Postgres, not a new managed service: this app has exactly one durable
 * store today and no Redis/Upstash anywhere in the stack; a 50-club network
 * with an internal control portal does not yet justify a new infrastructure
 * dependency purely for rate limiting. Revisit if request volume or latency
 * sensitivity ever makes a single extra DB round-trip per gated request a
 * real cost — the RateLimiter interface below does not change either way,
 * only getRateLimiter()'s implementation would.
 *
 * Fixed window (not sliding): a fixed window can admit up to 2x `max`
 * requests across a window boundary (all at the end of one window, all at
 * the start of the next). Accepted trade-off for this scope — it is still a
 * durable, real limit (unlike the previous no-op), and every call site here
 * gates administrative/auth actions, not a public high-throughput API.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimitOptions {
  /** Max requests allowed per window. Default 20. */
  max?: number;
  /** Window size in ms. Default 60_000 (1 minute). */
  windowMs?: number;
}

export interface RateLimiter {
  check(key: string, opts?: RateLimitOptions): Promise<RateLimitResult>;
}

const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_MS = 60_000;

const durableLimiter: RateLimiter = {
  async check(key: string, opts: RateLimitOptions = {}): Promise<RateLimitResult> {
    const max = opts.max ?? DEFAULT_MAX;
    const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    try {
      // upsert + increment is atomic at the row level in Postgres — two
      // concurrent requests in the same window both land correctly, no
      // read-then-write race (unlike a naive findFirst-then-create/update).
      const row = await prisma.rateLimitHit.upsert({
        where: { key_windowStart: { key, windowStart } },
        create: { key, windowStart, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      if (row.count > max) {
        const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
        return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
      }
      return { allowed: true };
    } catch {
      // Fail-open: a DB hiccup on the rate-limit table must never itself
      // become the outage for auth/onboarding/role management. The DB is
      // already a hard dependency for every one of these routes' actual
      // work, so this only matters for a transient blip on this one table.
      return { allowed: true };
    }
  },
};

export function getRateLimiter(): RateLimiter {
  return durableLimiter;
}
