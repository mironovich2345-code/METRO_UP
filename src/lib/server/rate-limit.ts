import "server-only";

/**
 * Rate-limiting abstraction. There is no distributed provider yet, so the
 * default limiter is permissive. Auth/onboarding endpoints call `check()` so a
 * real limiter (e.g. Upstash/Redis, keyed by IP + telegramId) can be dropped in
 * without touching call sites.
 *
 * TODO(rate-limit): back with a durable store before opening auth to the public.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

const permissiveLimiter: RateLimiter = {
  async check() {
    return { allowed: true };
  },
};

export function getRateLimiter(): RateLimiter {
  return permissiveLimiter;
}
