"use client";

/**
 * Sprint: mini-app-cold-start, section 2 — real millisecond timings for the
 * cold-start critical path, gated behind an explicit opt-in flag so this
 * stays silent by default everywhere, including production — matching
 * server/perf.ts's PERF_LOG=1 convention exactly, but for the client half of
 * the trace. A plain NODE_ENV==="development" gate (perf.ts's client twin,
 * perf.ts's useScreenPerfLog) is not enough here: capturing REAL Railway +
 * Telegram numbers (section 10/13) means enabling this on a real deploy,
 * which is only reachable client-side via a NEXT_PUBLIC_ var (server env
 * vars are never sent to the browser bundle). Set
 * NEXT_PUBLIC_PERF_LOG=1 at build time to enable; unset (the default) it is
 * a zero-cost no-op.
 *
 * Every event is a fixed label + a millisecond offset from the ONE shared
 * origin mark (module-eval time of providers.tsx, the earliest point our
 * own client code runs) — never a request body, header, user id, Telegram
 * initData, or token (section 2's own "No PII / No telegramId / No
 * initData / No token").
 */
const ENABLED = process.env.NEXT_PUBLIC_PERF_LOG === "1";

export type BootEvent =
  | "miniapp_open"
  | "telegram_ready"
  | "telegram_owner_known"
  | "persistent_cache_start"
  | "persistent_cache_ready"
  | "auth_request_start"
  | "auth_response_received"
  | "app_identity_ready"
  | "home_first_cached_render"
  | "home_first_fresh_render";

let originMs = 0;

/** Call once, as early as possible (providers.tsx module scope) — every
 * other event's `sinceOriginMs` is relative to this. Idempotent: a second
 * call is a no-op, so an accidental extra import never resets the clock. */
export function markBootOrigin() {
  if (originMs === 0) originMs = performance.now();
}

export function logBootEvent(event: BootEvent, extra?: Record<string, number | string | boolean>) {
  if (!ENABLED) return;
  markBootOrigin(); // defensive — an event logged before the explicit origin call still gets a sane (if slightly late) zero point, never a crash
  console.info(`[perf-boot] ${JSON.stringify({ event, sinceOriginMs: Math.round(performance.now() - originMs), ...extra })}`);
}
