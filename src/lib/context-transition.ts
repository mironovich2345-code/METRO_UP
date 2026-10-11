/**
 * Sprint: LIVE QA FIX QA-01 — "Atomic Context Switch / Remove Wrong-Cabinet
 * Flicker". Pure state/decision logic for the GLOBAL context-transition gate
 * (no React, no fetch — kept separate specifically so this has real,
 * DB-free, harness-free test coverage, same convention as control-plan-ui.ts
 * and cabinet-ui.ts).
 *
 * Root cause this closes (see AppUserProvider.tsx's own doc comment for the
 * full trace): a View-As start/end previously changed the server's cookie
 * and the client's AppUser/query cache across SEVERAL separate awaited
 * steps with no signal telling Home/the bottom nav/ViewAsBanner "an
 * identity change is in flight" — so whichever persona-dependent UI was
 * already mounted kept rendering, fully interactively, off the OLD identity
 * for the entire round trip. `runContextTransition` is the one place that
 * now owns "hide persona UI for the full duration of a switch, no matter
 * how long the underlying network calls take."
 *
 * Sprint: LIVE QA FIX QA-01.1 — "Context Switch Desync Recovery". Closes
 * ONE remaining failure-state gap QA-01 left: when the server-side switch
 * (viewAsApi.start/end) has ALREADY succeeded but the subsequent identity
 * confirmation (confirmIdentity) fails anyway, QA-01 settled straight back
 * to "idle" and revealed the last CONFIRMED (now-stale) AppUser — safer
 * than guessing the new one, but still an interactive UI the server no
 * longer agrees with (SERVER = new context, CLIENT = old cabinet). A third
 * phase, "desynced", now exists specifically for this one case — see
 * `ContextDesyncError` below for how it's distinguished from an ordinary
 * "the server call itself never succeeded" failure, which still settles to
 * plain "idle" exactly as before.
 */

/**
 * Three states:
 *  - "idle": no switch in flight; the ordinary app body renders.
 *  - "switching": a switch is in flight; the neutral ContextTransitionOverlay
 *    renders instead.
 *  - "desynced": the server-side switch SUCCEEDED but identity confirmation
 *    did not — the client can no longer trust ANY locally-held identity, so
 *    neither the old nor a guessed new cabinet may render; only
 *    ContextRecoveryScreen (a full-reload prompt) may. This is a terminal
 *    state within one page lifetime — the only way out is the reload the
 *    recovery screen's own button performs, never an in-app transition back
 *    to "idle" (there is deliberately no such event in the table below).
 */
export type ContextTransitionPhase = "idle" | "switching" | "desynced";

export type ContextTransitionEvent = "begin" | "settled" | "desynced";

/**
 * The full transition table (brief section 14 / QA-01.1):
 *   idle      --begin-->    switching
 *   switching --settled-->  idle        (ordinary success OR failure — the
 *                                        server-side operation never
 *                                        succeeded, so the old confirmed
 *                                        context is still honest)
 *   switching --desynced--> desynced    (the server-side operation DID
 *                                        succeed, but identity confirmation
 *                                        failed — see ContextDesyncError)
 * `begin` while already switching is idempotent (stays "switching") rather
 * than throwing — double-submit protection (section 18) is handled by the
 * CALLER disabling its own trigger while switching, not by this function
 * rejecting a redundant event. There is no event that leaves "desynced" —
 * recovering requires a full application reload, outside this table.
 */
export function nextContextTransitionPhase(
  current: ContextTransitionPhase,
  event: ContextTransitionEvent,
): ContextTransitionPhase {
  if (event === "begin") return "switching";
  if (event === "desynced") return "desynced";
  return "idle"; // "settled"
}

/**
 * The ONE render-gate decision every persona-dependent surface (Home,
 * header, bottom navigation, management layouts, ViewAsBanner) shares
 * (brief section 10 — "one source of truth"). AppShellFrame is the single
 * call site that actually acts on this; everything else downstream of it
 * never needs its own copy of this check. Sprint QA-01.1 — "desynced" is
 * NOT idle, so the ordinary app body stays hidden in that phase too (it
 * gets its own, DIFFERENT surface — see `isDesynced` below — never the
 * ordinary ContextTransitionOverlay and never the real app body).
 */
export function canRenderAppBody(phase: ContextTransitionPhase): boolean {
  return phase === "idle";
}

/**
 * Sprint: LIVE QA FIX QA-01.1 — true exactly when the GLOBAL recovery
 * screen (ContextRecoveryScreen, a full-reload prompt) must render instead
 * of the ordinary ContextTransitionOverlay. AppShellFrame checks this
 * alongside `canRenderAppBody` to pick between the app body / the ordinary
 * transition overlay / the recovery screen — three mutually exclusive
 * outcomes from the one shared `phase` value, never three independently
 * maintained booleans.
 */
export function isDesynced(phase: ContextTransitionPhase): boolean {
  return phase === "desynced";
}

/**
 * Sprint: LIVE QA FIX QA-01.1 — thrown by `confirmIdentity()` (AppUserProvider)
 * specifically, and ONLY when the server-side context-changing operation
 * that preceded it is known to have already succeeded (every existing
 * call site awaits `viewAsApi.start`/`end` — which throws on its own
 * failure — strictly BEFORE calling `confirmIdentity()`, so by construction
 * `confirmIdentity()` is never reached unless that prior call already
 * succeeded). `runContextTransition` recognizes this exact type
 * (`instanceof`, never a string/code match that a different, unrelated
 * error could accidentally satisfy) to settle into "desynced" instead of
 * the ordinary "idle" any other failure settles to.
 */
export class ContextDesyncError extends Error {
  constructor(cause?: unknown) {
    super("Context switch succeeded server-side, but identity confirmation failed.");
    this.name = "ContextDesyncError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Runs `action` (the server call(s), query-cache clear, identity refresh,
 * and any necessary navigation — see each call site's own composition) as
 * ONE atomic context switch:
 *  1. `onPhaseChange("switching")` fires synchronously, BEFORE `action` is
 *     even invoked — step 2 of the brief's required start-order, satisfied
 *     by construction (no awaited work happens before this call).
 *  2. `action()` runs to completion (or rejection) — whatever it awaits
 *     internally (server request, confirmIdentity, router.push, …), the
 *     phase stays "switching" for the ENTIRE duration, no matter how long.
 *  3. On success: `onPhaseChange("idle")` fires — the new cabinet may render.
 *  4. On an ORDINARY failure (the server-side operation itself never
 *     succeeded — see module doc): `onPhaseChange("idle")` fires (section 9
 *     — a failed switch must never leave the gate stuck on "switching"
 *     forever) and the original error is rethrown, so the caller's own
 *     existing error UI runs exactly as before this gate existed, against
 *     the still-honest old confirmed context.
 *  5. On a `ContextDesyncError` specifically (QA-01.1 — the server-side
 *     operation succeeded but identity confirmation did not):
 *     `onPhaseChange("desynced")` fires INSTEAD, and the error is
 *     deliberately swallowed, not rethrown — no caller's local error UI
 *     may run here, because the global ContextRecoveryScreen (the only
 *     thing AppShellFrame renders once desynced) is now the sole surface;
 *     reaching back into a covered, no-longer-trustworthy screen's own
 *     local state would be exactly the "let the user keep using the stale
 *     cabinet" outcome this phase exists to prevent.
 *
 * Takes `onPhaseChange` as a plain callback (not a React state setter
 * directly) so this function itself stays React-free and directly
 * unit-testable with a recording spy instead of a DOM/hook-testing harness
 * this repo doesn't have.
 */
export async function runContextTransition(
  action: () => Promise<void>,
  onPhaseChange: (phase: ContextTransitionPhase) => void,
): Promise<void> {
  onPhaseChange(nextContextTransitionPhase("idle", "begin"));
  try {
    await action();
    onPhaseChange(nextContextTransitionPhase("switching", "settled"));
  } catch (e) {
    if (e instanceof ContextDesyncError) {
      onPhaseChange(nextContextTransitionPhase("switching", "desynced"));
      return;
    }
    onPhaseChange(nextContextTransitionPhase("switching", "settled"));
    throw e;
  }
}
