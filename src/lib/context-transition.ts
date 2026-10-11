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
 */

/** Only two states are ever meaningful here: either a switch is in flight
 * (persona-dependent UI must not render) or it is not. No "error" phase of
 * its own — a failed switch settles straight back to "idle" and the error
 * is the CALLER's job to surface (its own existing message/toast), exactly
 * like it already does for every other failed action in this app. */
export type ContextTransitionPhase = "idle" | "switching";

export type ContextTransitionEvent = "begin" | "settled";

/**
 * The full transition table (brief section 14):
 *   idle      --begin-->   switching
 *   switching --settled--> idle   (success OR failure — see module doc)
 * `begin` while already switching is idempotent (stays "switching") rather
 * than throwing — double-submit protection (section 18) is handled by the
 * CALLER disabling its own trigger while switching, not by this function
 * rejecting a redundant event.
 */
export function nextContextTransitionPhase(
  current: ContextTransitionPhase,
  event: ContextTransitionEvent,
): ContextTransitionPhase {
  if (event === "begin") return "switching";
  return "idle";
}

/**
 * The ONE render-gate decision every persona-dependent surface (Home,
 * header, bottom navigation, management layouts, ViewAsBanner) shares
 * (brief section 10 — "one source of truth"). AppShellFrame is the single
 * call site that actually acts on this; everything else downstream of it
 * never needs its own copy of this check.
 */
export function canRenderAppBody(phase: ContextTransitionPhase): boolean {
  return phase === "idle";
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
 *  3. `onPhaseChange("idle")` fires once `action` SETTLES — success or
 *     failure alike (section 9: a failed switch must never leave the gate
 *     stuck on "switching" forever) — then the original error (if any) is
 *     rethrown so the caller's own existing error UI runs exactly as before
 *     this gate existed.
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
  } finally {
    onPhaseChange(nextContextTransitionPhase("switching", "settled"));
  }
}
