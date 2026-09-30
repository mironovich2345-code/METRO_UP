import "server-only";

/**
 * Sprint: mini-app-performance, section 16 — a small, OPT-IN (never
 * NODE_ENV-based — this stays silent even in local dev unless explicitly
 * requested) performance logging facility. Set `PERF_LOG=1` in the
 * environment to enable; unset (the default everywhere, including
 * production) it is a zero-cost no-op — `fn()` runs directly, no
 * `performance.now()` call, no console write, matching section 16's "do not
 * create permanent noisy production telemetry unless clearly justified."
 *
 * Every logged field is a route name, a phase label, or a duration in
 * milliseconds — never a request body, header, query string, user id,
 * Telegram initData, or token (section 3/17).
 */
const ENABLED = process.env.PERF_LOG === "1";

export async function perfTimed<T>(event: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.info(`[perf-api] ${JSON.stringify({ event, durationMs: Math.round(performance.now() - start) })}`);
  }
}
