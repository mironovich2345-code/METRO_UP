"use client";

/**
 * Sprint: mini-app-server-startup, section 6 — "delay non-essential prefetch
 * until AFTER first useful render... Startup-critical request gets
 * priority." `requestIdleCallback` is the direct expression of that: it
 * schedules `fn` for whenever the main thread is next idle, never
 * preempting an in-progress render or a higher-priority task. Falls back to
 * a short, fixed `setTimeout` where it doesn't exist (notably Safari/iOS
 * WKWebView — Telegram's primary iOS surface) — still later than the
 * current synchronous effect tick, just without true idle-detection.
 */
export function runWhenIdle(fn: () => void, timeoutMs = 1500): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 200);
  }
}
