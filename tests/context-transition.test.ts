import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canRenderAppBody,
  isDesynced,
  nextContextTransitionPhase,
  runContextTransition,
  ContextDesyncError,
  type ContextTransitionPhase,
} from "../src/lib/context-transition";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Sprint: LIVE QA FIX QA-01 — "Atomic Context Switch / Remove Wrong-Cabinet
 * Flicker". Real, direct tests of the pure state machine (context-
 * transition.ts has no "use client"/server-only import, so it is imported
 * and exercised here unmediated — no mirror, no regex-only proof) plus
 * structural wiring proof for the pieces that genuinely need a React/DOM
 * harness this repo doesn't have (brief sections 14/15/16).
 */

/* ===================================================================== *
 *  Section 14 — state machine
 * ===================================================================== */

test("CTX-A: idle --begin--> switching", () => {
  assert.equal(nextContextTransitionPhase("idle", "begin"), "switching");
});

test("CTX-B: switching --settled--> idle (the success path)", () => {
  assert.equal(nextContextTransitionPhase("switching", "settled"), "idle");
});

test("CTX-C: switching --settled--> idle is the SAME transition used for a failed switch — the table has no separate 'error' phase; see runContextTransition's own tests below for proof the failure case still rethrows", () => {
  assert.equal(nextContextTransitionPhase("switching", "settled"), "idle");
});

test("CTX-D: begin while already switching is idempotent (stays switching, never throws) — double-submit protection is the CALLER's job (AppUserProvider's switchingRef), not this table's", () => {
  assert.equal(nextContextTransitionPhase("switching", "begin"), "switching");
});

/** A controllable deferred promise — lets a test observe the phase WHILE
 * the action is still pending, not just before/after it resolves. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("CTX-E: runContextTransition fires 'switching' SYNCHRONOUSLY, before the action has resolved at all — the exact 'mark ACTIVE before awaiting any network request' requirement (brief section 5, step 2)", () => {
  const phases: ContextTransitionPhase[] = [];
  const { promise, resolve } = deferred<void>();
  const result = runContextTransition(() => promise, (p) => phases.push(p));
  // No `await` yet — if the implementation deferred the first phase change
  // behind a microtask, `phases` would still be empty right here.
  assert.deepEqual(phases, ["switching"]);
  resolve();
  return result;
});

test("CTX-F: THE EXACT SCENARIO — 'switch success before AppUser refresh complete' — while the action's own internal steps are still in flight (e.g. the server call resolved but confirmIdentity has not), the phase stays 'switching'; only once the WHOLE action settles does it flip to 'idle'", async () => {
  const phases: ContextTransitionPhase[] = [];
  const serverCall = deferred<void>();
  const confirmStep = deferred<void>();
  const action = async () => {
    await serverCall.promise; // models viewAsApi.start/end
    assert.equal(phases.at(-1), "switching", "still switching mid-action, after the server call but before confirmIdentity");
    await confirmStep.promise; // models confirmIdentity
  };
  const result = runContextTransition(action, (p) => phases.push(p));
  assert.deepEqual(phases, ["switching"]);
  serverCall.resolve();
  await Promise.resolve(); // let the microtask queue drain to the assert inside `action`
  assert.deepEqual(phases, ["switching"], "server call settled, but the whole action has not — still switching");
  confirmStep.resolve();
  await result;
  assert.deepEqual(phases, ["switching", "idle"], "new AppUser confirmed -> idle, exactly once, only after everything settled");
});

test("CTX-G: switch failure -> idle, AND the original error propagates to the caller (so the caller's own existing error UI — message/toast/retry — still runs exactly as before this gate existed)", async () => {
  const phases: ContextTransitionPhase[] = [];
  const boom = new Error("server rejected the switch");
  await assert.rejects(
    runContextTransition(async () => {
      throw boom;
    }, (p) => phases.push(p)),
    boom,
  );
  assert.deepEqual(phases, ["switching", "idle"]);
});

test("CTX-H: a failure AFTER the server call succeeded (confirmIdentity fails) still settles to idle and still rethrows — the phase table does not distinguish WHERE inside the action the failure happened, only THAT it happened", async () => {
  const phases: ContextTransitionPhase[] = [];
  const boom = new Error("confirmIdentity failed");
  await assert.rejects(
    runContextTransition(async () => {
      await Promise.resolve(); // the server call succeeding
      throw boom; // confirmIdentity failing
    }, (p) => phases.push(p)),
    boom,
  );
  assert.deepEqual(phases, ["switching", "idle"]);
});

test("CTX-I: exit preview exercises the IDENTICAL lifecycle as start preview — runContextTransition has no branch for 'which direction' the switch is; the SAME function, the SAME two-phase guarantee, regardless of what the injected action actually does", async () => {
  const startPhases: ContextTransitionPhase[] = [];
  await runContextTransition(async () => {}, (p) => startPhases.push(p));
  const endPhases: ContextTransitionPhase[] = [];
  await runContextTransition(async () => {}, (p) => endPhases.push(p));
  assert.deepEqual(startPhases, ["switching", "idle"]);
  assert.deepEqual(endPhases, ["switching", "idle"]);
});

/* ===================================================================== *
 *  Section 15 — render gate
 * ===================================================================== */

test("CTX-J: canRenderAppBody(idle) === true — the real app body may render", () => {
  assert.equal(canRenderAppBody("idle"), true);
});

test("CTX-K: canRenderAppBody(switching) === false — the neutral transition surface must show instead", () => {
  assert.equal(canRenderAppBody("switching"), false);
});

test("CTX-L (structural): AppShellFrame reads contextTransitionPhase from useAppUser() and feeds it to canRenderAppBody/isDesynced to decide between the real app body, ContextTransitionOverlay, and ContextRecoveryScreen — the ONE call site that acts on either shared predicate", () => {
  const src = read("src/components/app-shell-frame.tsx");
  assert.match(src, /import \{ canRenderAppBody, isDesynced \} from "@\/lib\/context-transition";/);
  assert.match(src, /const \{ user, switchContext, confirmIdentity, contextTransitionPhase \} = useAppUser\(\);/);
  assert.match(src, /isDesynced\(contextTransitionPhase\) \? \(\s*\n\s*<ContextRecoveryScreen \/>\s*\n\s*\) : \(\s*\n\s*!canRenderAppBody\(contextTransitionPhase\) && <ContextTransitionOverlay \/>\s*\n\s*\)/);
});

test("CTX-M (structural): the transition overlay (or, exclusively, the recovery screen) is a `fixed inset-0` layer stacked ON TOP of the banner/children (never a conditional replacement of them) — this is the deliberate 'cover, don't unmount' choice that keeps the triggering screen's own local state (error messages, busy flags) intact across a failed switch", () => {
  const src = read("src/components/app-shell-frame.tsx");
  const overlayFnSrc = src.slice(src.indexOf("function ContextTransitionOverlay"), src.indexOf("function ContextRecoveryScreen"));
  assert.match(overlayFnSrc, /fixed inset-0/);
  const recoveryFnSrc = src.slice(src.indexOf("function ContextRecoveryScreen"), src.length);
  assert.match(recoveryFnSrc, /fixed inset-0/);
  // The banner/children AND the (conditionally-shown) overlay/recovery
  // screen are siblings inside the SAME return — never an `if/else`
  // swapping the banner/children themselves out for either one.
  const returnSrc = src.slice(src.indexOf("return (\n    <div className=\"app-shell\">"), src.indexOf("function ContextTransitionOverlay"));
  assert.match(returnSrc, /<AccessStatusGate>\{children\}<\/AccessStatusGate>/);
  assert.match(returnSrc, /isDesynced\(contextTransitionPhase\) \?/);
});

test("CTX-M2 (structural): the two surfaces are MUTUALLY EXCLUSIVE — ContextRecoveryScreen is chosen by a ternary (isDesynced ? recovery : overlay-or-nothing), never a second independent condition that could show both, or neither, at once", () => {
  const src = read("src/components/app-shell-frame.tsx");
  const returnSrc = src.slice(src.indexOf("return (\n    <div className=\"app-shell\">"), src.indexOf("function ContextTransitionOverlay"));
  const ternaryIdx = returnSrc.indexOf("isDesynced(contextTransitionPhase) ?");
  assert.ok(ternaryIdx >= 0);
  // Exactly one ContextRecoveryScreen reference and one ContextTransitionOverlay
  // reference inside the render — both live inside the SAME ternary's two
  // branches, not behind separate, independently-toggleable conditions.
  const recoveryMatches = returnSrc.match(/<ContextRecoveryScreen \/>/g) ?? [];
  const overlayMatches = returnSrc.match(/<ContextTransitionOverlay \/>/g) ?? [];
  assert.equal(recoveryMatches.length, 1);
  assert.equal(overlayMatches.length, 1);
});

test("CTX-N (structural): the transition surface shows no previous role/club name, no skeleton cards — only the brand wordmark, a spinner, and the one required copy line ('Переключаем кабинет…')", () => {
  const src = read("src/components/app-shell-frame.tsx");
  const fnSrc = src.slice(src.indexOf("function ContextTransitionOverlay"), src.length);
  assert.match(fnSrc, /Переключаем кабинет…/);
  assert.doesNotMatch(fnSrc, /clubName|previewRole|realRoleLabel|scopeLabel/);
});

/* ===================================================================== *
 *  Section 16 — identity snapshot / cache regressions (re-confirmed, not
 *  re-implemented — SECURITY-COLD-START-C in mini-app-cold-start.test.ts
 *  already real-tests persistIdentitySnapshot's own viewContext guard,
 *  untouched by this round; these are the NEW QA-01-specific wiring checks)
 * ===================================================================== */

test("CTX-O (structural): AppUserProvider's switchContext has a double-submit guard (switchingRef) that is checked BEFORE runContextTransition is ever called — section 18", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  const fnStart = src.indexOf("const switchContext = useCallback(async (action");
  const fnEnd = src.indexOf("}, []);", fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /if \(switchingRef\.current\) return;/);
  assert.match(fnSrc, /switchingRef\.current = true;/);
  const guardIdx = fnSrc.indexOf("if (switchingRef.current) return;");
  const runIdx = fnSrc.indexOf("await runContextTransition(");
  assert.ok(guardIdx >= 0 && runIdx > guardIdx, "the guard must run BEFORE runContextTransition, not after");
});

test("CTX-P (structural): confirmIdentity only ever mutates user/status on a SUCCESSFUL fetchMe (via applyFetchedIdentity) — a failed confirmation (even after its one retry) never calls setUser/setStatus itself, so the LAST confirmed identity is what remains on screen, never a half-updated one", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  const confirmSrc = src.slice(src.indexOf("const confirmIdentity = useCallback"), src.indexOf("const [transitionPhase"));
  // confirmIdentity's own body contains no direct setUser/setStatus call —
  // both only happen inside applyFetchedIdentity, which confirmIdentity
  // calls (and lets fail upward) rather than duplicating.
  const ownBody = confirmSrc.slice(confirmSrc.indexOf("=> {"), confirmSrc.lastIndexOf("}"));
  assert.doesNotMatch(ownBody, /setUser\(|setStatus\(/);
  assert.match(confirmSrc, /await applyFetchedIdentity\(\);[\s\S]*catch[\s\S]*await applyFetchedIdentity\(\);/);
});

test("CTX-Q (structural): every View-As start/end call site composes its server call + `await confirmIdentity();` + (for start) navigation INSIDE switchContext's action — never confirmIdentity awaited AFTER switchContext has already resolved, which would reopen the exact 'old cabinet lingers until the next step' race this round closes. Each of the three real call sites, checked exactly (not a generic text scan, which would also match this file's OWN prose mentioning 'confirmIdentity()' in doc comments)", () => {
  const appShell = read("src/components/app-shell-frame.tsx");
  assert.match(appShell, /switchContext\(async \(\) => \{\s*\n\s*await viewAsApi\.end\(\);\s*\n\s*await confirmIdentity\(\);\s*\n\s*\}\);/);

  const cityClub = read("src/app/city/club/page.tsx");
  assert.match(cityClub, /switchContext\(async \(\) => \{\s*\n\s*await viewAsApi\.start\(\{ role: "CLUB_MANAGER", clubId \}\);\s*\n\s*await confirmIdentity\(\);\s*\n\s*router\.push\("\/home"\);\s*\n\s*\}\);/);

  // LIVE QA QA-03.1 — Home's duplicate ReturnToCityCabinetCard (the third
  // call site) was removed; the global ViewAsBanner above is the single exit.
  const home = read("src/app/home/page.tsx");
  assert.doesNotMatch(home, /viewAsApi\.end\(/);
});

/* ===================================================================== *
 *  Sprint: LIVE QA FIX QA-01.1 — "Context Switch Desync Recovery".
 *  Distinguishes two failure classes the QA-01 state machine used to
 *  collapse into one: the server-side operation never succeeding (safe
 *  to return to the old confirmed cabinet) vs. the server-side operation
 *  succeeding but identity confirmation failing (unsafe — must desync).
 * ===================================================================== */

test("CTX-R: idle -> switching, re-confirmed under the 3-phase table", () => {
  assert.equal(nextContextTransitionPhase("idle", "begin"), "switching");
});

test("CTX-S: ORDINARY server failure (the action throws before ever reaching identity confirmation) -> settles to idle and rethrows — the old confirmed cabinet is still honest and may render again", async () => {
  const phases: ContextTransitionPhase[] = [];
  const serverError = new Error("viewAsApi.start rejected (403/network) — server state never changed");
  await assert.rejects(
    runContextTransition(async () => {
      throw serverError; // the server call itself failed — never a ContextDesyncError
    }, (p) => phases.push(p)),
    serverError,
  );
  assert.deepEqual(phases, ["switching", "idle"]);
  assert.equal(canRenderAppBody(phases.at(-1) as ContextTransitionPhase), true);
});

test("CTX-T: server success + identity success -> idle, the new (now-confirmed) UI may render", async () => {
  const phases: ContextTransitionPhase[] = [];
  await runContextTransition(async () => {
    /* viewAsApi.start/end resolves */
    /* confirmIdentity resolves */
  }, (p) => phases.push(p));
  assert.deepEqual(phases, ["switching", "idle"]);
  assert.equal(canRenderAppBody(phases.at(-1) as ContextTransitionPhase), true);
});

test("CTX-U: THE QA-01.1 FIX — server success + identity failure (confirmIdentity throws ContextDesyncError) settles to 'desynced', NOT 'idle' — and the error is swallowed here (does not reject the caller's own promise), because no local error UI may run against a screen the global ContextRecoveryScreen has already taken over", async () => {
  const phases: ContextTransitionPhase[] = [];
  await runContextTransition(async () => {
    throw new ContextDesyncError(new Error("fetchMe failed twice after the server-side switch already succeeded"));
  }, (p) => phases.push(p));
  assert.deepEqual(phases, ["switching", "desynced"]);
});

test("CTX-V: desynced -> canRenderAppBody === false — the ordinary app body may NOT render while desynced, same as while switching", () => {
  assert.equal(canRenderAppBody("desynced"), false);
});

test("CTX-W: isDesynced distinguishes 'desynced' from the ordinary transient 'switching' phase — the exact predicate AppShellFrame uses to choose ContextRecoveryScreen instead of ContextTransitionOverlay", () => {
  assert.equal(isDesynced("desynced"), true);
  assert.equal(isDesynced("switching"), false);
  assert.equal(isDesynced("idle"), false);
});

test("CTX-X: a PLAIN Error is NEVER mistaken for desync, even one that merely MENTIONS desync in its own message — only a genuine ContextDesyncError instance settles to 'desynced'; every other rejection settles to the ordinary 'idle' and rethrows", async () => {
  const phases: ContextTransitionPhase[] = [];
  const lookalike = new Error("context desynced maybe?"); // same-ish wording, wrong type
  await assert.rejects(
    runContextTransition(async () => {
      throw lookalike;
    }, (p) => phases.push(p)),
    lookalike,
  );
  assert.deepEqual(phases, ["switching", "idle"]);
});

test("CTX-Y (structural): confirmIdentity throws ContextDesyncError (not a plain Error) on its retry's own failure, wrapping the underlying cause — every existing call site only ever invokes confirmIdentity() AFTER its own preceding server mutation already succeeded (CTX-Q), so reaching this catch always means 'server changed, client couldn't confirm'", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  assert.match(src, /import \{ runContextTransition, ContextDesyncError, type ContextTransitionPhase \} from "@\/lib\/context-transition";/);
  const fnSrc = src.slice(src.indexOf("const confirmIdentity = useCallback"), src.indexOf("const [transitionPhase"));
  assert.match(fnSrc, /throw new ContextDesyncError\(e\);/);
});

test("CTX-Z (structural): runContextTransition recognizes ContextDesyncError specifically via `instanceof`, never a string/error-code match an unrelated error could accidentally satisfy", () => {
  const src = read("src/lib/context-transition.ts");
  const fnSrc = src.slice(src.indexOf("export async function runContextTransition"), src.length);
  assert.match(fnSrc, /if \(e instanceof ContextDesyncError\)/);
});

test("CTX-AA (structural): ContextRecoveryScreen's recovery action calls window.location.reload() directly — a full application reload/rebootstrap, never a partial client-side retry of the SAME confirmIdentity() that just failed", () => {
  const src = read("src/components/app-shell-frame.tsx");
  const fnSrc = src.slice(src.indexOf("function ContextRecoveryScreen"), src.length);
  assert.match(fnSrc, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
});

test("CTX-AB (structural): no automatic reload anywhere in app-shell-frame.tsx or context-transition.ts — the recovery is reachable ONLY via the button's own onClick, never a useEffect/timer that could fire it without a tap, and never a loop (no retry counter, because there is no automatic attempt to count in the first place)", () => {
  const appShell = read("src/components/app-shell-frame.tsx");
  assert.doesNotMatch(appShell, /setTimeout|setInterval/);
  const recoveryFnSrc = appShell.slice(appShell.indexOf("function ContextRecoveryScreen"), appShell.length);
  assert.doesNotMatch(recoveryFnSrc, /useEffect/);
  const ctxLib = read("src/lib/context-transition.ts");
  assert.doesNotMatch(ctxLib, /setTimeout|setInterval/);
});

test("CTX-AC (structural): the recovery screen's own copy matches the mandated text exactly", () => {
  const src = read("src/components/app-shell-frame.tsx");
  const fnSrc = src.slice(src.indexOf("function ContextRecoveryScreen"), src.length);
  assert.match(fnSrc, /Не удалось обновить кабинет/);
  assert.match(fnSrc, /Контекст уже изменён, но приложение не смогло получить актуальные данные\./);
  assert.match(fnSrc, /Обновить приложение/);
});
