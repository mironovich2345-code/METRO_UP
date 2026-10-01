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

/**
 * Sprint: mini-app-server-startup, section 4 — companion to perfTimed for
 * the "measure several sub-phases of one request, log them together as ONE
 * row" pattern (generalizes what the auth route hand-rolled for
 * [perf-auth-telegram], so [perf-home] and friends don't each reinvent it).
 * A plain `console.info` behind the same PERF_LOG=1 gate — never a new
 * telemetry sink, never PII (callers pass only phase names/milliseconds).
 */
export function logPerf(event: string, fields: Record<string, number | string>): void {
  if (!ENABLED) return;
  console.info(`[${event}] ${JSON.stringify(fields)}`);
}

/**
 * Wrap one sub-phase of a larger operation so its wall time lands in
 * `record[key]`, without changing `run`'s resolved value or error/rejection
 * behavior — composes directly with home-resolve.ts's settleWidget:
 * `settleWidget("plan", timedField(timings, "planMs", () => getPlanToday(user)), EMPTY_PLAN)`.
 * Zero-cost when PERF_LOG is off — returns `run` itself, unwrapped, not even
 * a `performance.now()` call, matching perfTimed's own disabled-state contract.
 */
export function timedField<T>(record: Record<string, number>, key: string, run: () => Promise<T>): () => Promise<T> {
  if (!ENABLED) return run;
  return async () => {
    const start = performance.now();
    try {
      return await run();
    } finally {
      record[key] = Math.round(performance.now() - start);
    }
  };
}
