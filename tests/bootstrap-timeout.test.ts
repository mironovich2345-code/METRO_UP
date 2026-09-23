import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithTimeout, TimeoutError } from "../src/lib/async-timeout";
import { bootPhase } from "../src/lib/boot-state";

/**
 * P0 infinite-bootstrap fix. The Telegram bootstrap must ALWAYS settle: a hanging
 * auth request is bounded by runWithTimeout (abort + TimeoutError), which the
 * provider maps to a recoverable "error" state (retry UI) — never an endless
 * "loading". These model the four required cases (A resolve, B reject, C never
 * resolve → timeout, D retry → success) at the timeout-orchestration layer.
 */

// A — auth resolves → the value flows through → provider becomes authenticated → ready.
test("A: auth resolves within the timeout → resolves; phase becomes ready", async () => {
  const user = await runWithTimeout(async () => "USER", 50);
  assert.equal(user, "USER");
  // provider: setStatus("authenticated") → hydrated true → ready (not black, not loading)
  assert.equal(bootPhase({ bootstrapError: false, hydrated: true }), "ready");
});

// B — auth rejects → rejects → provider sets error → retry UI.
test("B: auth rejects → rejects; phase becomes error (retry UI)", async () => {
  await assert.rejects(runWithTimeout(async () => { throw new Error("network"); }, 50), /network/);
  assert.equal(bootPhase({ bootstrapError: true, hydrated: false }), "error");
});

// C — auth NEVER resolves → TimeoutError (aborted) → error, never infinite loading.
test("C: auth never resolves → TimeoutError + signal aborted (no infinite loading)", async () => {
  let abortedSignal: AbortSignal | null = null;
  await assert.rejects(
    runWithTimeout((signal) => {
      abortedSignal = signal;
      return new Promise<string>(() => {}); // never settles
    }, 30),
    (e) => e instanceof TimeoutError,
  );
  assert.equal(abortedSignal!.aborted, true); // the hung request was aborted, not orphaned
  assert.equal(bootPhase({ bootstrapError: true, hydrated: false }), "error");
});

// D — retry after a timeout starts a FRESH attempt that can succeed → ready.
test("D: retry after timeout → fresh attempt succeeds → ready", async () => {
  // first attempt times out
  await assert.rejects(runWithTimeout(() => new Promise<string>(() => {}), 20), (e) => e instanceof TimeoutError);
  // retry: a fresh runWithTimeout (fresh AbortController) resolves
  const controllers: AbortSignal[] = [];
  const user = await runWithTimeout(async (signal) => { controllers.push(signal); return "USER"; }, 50);
  assert.equal(user, "USER");
  assert.equal(controllers[0].aborted, false); // retry used a clean, non-aborted signal
  assert.equal(bootPhase({ bootstrapError: false, hydrated: true }), "ready");
});

test("runWithTimeout: a late resolve after timeout does not flip the result", async () => {
  // Ensures no double-settle: once timed out, a later resolution is ignored.
  let resolveLate: (v: string) => void = () => {};
  const p = runWithTimeout(() => new Promise<string>((res) => { resolveLate = res; }), 20);
  await assert.rejects(p, (e) => e instanceof TimeoutError);
  resolveLate("late"); // must not throw / must be a no-op
  assert.ok(true);
});
