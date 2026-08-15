/**
 * Basic per-user, per-instance sliding-window rate limit for Metric chat
 * (server-side — never client-only). Pure/injectable clock so it is testable.
 * A durable store (Redis) can replace this later without changing call sites.
 */
const WINDOW_MS = 60_000;
const MAX_IN_WINDOW = 10;

const hits = new Map<string, number[]>();

export function checkMetricRate(userId: string, now: number = Date.now(), max = MAX_IN_WINDOW, windowMs = WINDOW_MS): { allowed: boolean; retryAfterSeconds: number } {
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    hits.set(userId, arr);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }
  arr.push(now);
  hits.set(userId, arr);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test helper — reset the in-memory window. */
export function _resetMetricRate(): void {
  hits.clear();
}
