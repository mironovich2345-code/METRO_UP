/**
 * Fault isolation for the Home dashboard widgets (pure — no server-only import,
 * unit testable). A single widget's data call failing must NEVER fail the whole
 * /api/home response: settleWidget resolves to a safe fallback and logs a
 * non-PII marker instead of rejecting. Auth/route errors are handled elsewhere
 * (outside getHomeDashboard/getHomeDashboardFor) and are intentionally NOT
 * covered here.
 *
 * Ported from main's dc9f8e8 (production P0: one failing widget was 500-ing
 * the whole dashboard) rather than cherry-picked — Sprint 1 / Phase 2D
 * restructured home.ts's Promise.all into two entry points (getHomeDashboard
 * for real users, getHomeDashboardFor for the View As synthetic persona), so
 * a literal cherry-pick of dc9f8e8's diff would conflict on every line of a
 * function that no longer exists in this shape. This file itself is
 * unchanged from dc9f8e8 — it never depended on which caller uses it.
 */

/** Only short, safe error codes (e.g. Prisma "P2025") — never messages/PII. */
function safeCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" && /^[A-Za-z0-9_]{1,16}$/.test(c) ? c : undefined;
}

export function logHomeWidgetError(widget: string, e: unknown): void {
  const errorType = e instanceof Error ? e.name : typeof e;
  const code = safeCode(e);
  console.error(`[home-widget-error] ${JSON.stringify({ widget, errorType, ...(code ? { code } : {}) })}`);
}

/**
 * Run one dashboard widget; on failure log a safe marker and return `fallback`.
 * Never throws. `onError` is injectable for tests.
 */
export async function settleWidget<T>(
  widget: string,
  run: () => Promise<T>,
  fallback: T,
  onError: (widget: string, e: unknown) => void = logHomeWidgetError,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    onError(widget, e);
    return fallback;
  }
}
