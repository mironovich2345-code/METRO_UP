import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPhase, onboardingPersistTarget } from "../src/lib/boot-state";

/**
 * P0 black-screen hotfix. The employee app must never render a blank full-height
 * div: every unresolved/failed bootstrap maps to a real loader or a recoverable
 * error, and Telegram-unauthenticated onboarding must never write an ignored
 * local profile. These pure helpers back the EmployeeBootGate and completeOnboarding.
 */

/* ------- item 14: onboarding OK → loading → ready (no black screen) -------- */
test("boot: unresolved bootstrap is 'loading' (a real loader), then 'ready'", () => {
  // Right after onboarding navigation while auth bootstrap is still in flight:
  assert.equal(bootPhase({ bootstrapError: false, hydrated: false }), "loading");
  // Bootstrap resolves → the employee route renders:
  assert.equal(bootPhase({ bootstrapError: false, hydrated: true }), "ready");
});

/* ------- item 15: bootstrap failure → recoverable, retry → ready ---------- */
test("boot: failed bootstrap is 'error' (recoverable), a successful retry → 'ready'", () => {
  assert.equal(bootPhase({ bootstrapError: true, hydrated: false }), "error");
  // error takes precedence even if a stale hydrated flag lingers:
  assert.equal(bootPhase({ bootstrapError: true, hydrated: true }), "error");
  // after retryBootstrap succeeds:
  assert.equal(bootPhase({ bootstrapError: false, hydrated: true }), "ready");
});

test("boot: 'ready' does not require a profile (unonboarded users reach onboarding)", () => {
  // A profile-less but decided user is 'ready' so the page can route to /welcome.
  assert.equal(bootPhase({ bootstrapError: false, hydrated: true }), "ready");
});

/* ---- item 16: Telegram-unauthenticated onboarding must be blocked -------- */
test("onboarding target: Telegram + authenticated → server", () => {
  assert.equal(onboardingPersistTarget({ isInsideTelegram: true, isAuthenticated: true }), "server");
});

test("onboarding target: Telegram + NOT authenticated → blocked (never a local/demo profile)", () => {
  assert.equal(onboardingPersistTarget({ isInsideTelegram: true, isAuthenticated: false }), "blocked");
});

test("onboarding target: outside Telegram → local (web/demo unchanged)", () => {
  assert.equal(onboardingPersistTarget({ isInsideTelegram: false, isAuthenticated: false }), "local");
  assert.equal(onboardingPersistTarget({ isInsideTelegram: false, isAuthenticated: true }), "local");
});

/* --------------------- integration / framework cases --------------------- */
const skip = { skip: "integration: requires Postgres or Next runtime" } as const;
// item 16 (DB): both upsert branches must persist onboardingCompleted=true.
test("onboarding CREATE branch persists onboardingCompleted=true", skip, () => {});
test("onboarding UPDATE branch persists onboardingCompleted=true (was the latent bug)", skip, () => {});
// item 17: an uncaught render error renders the recoverable error boundary, not a
// blank document. Next.js error/global-error boundaries need the framework runtime
// to exercise; verified via the manual checklist rather than a fabricated unit test.
test("error boundary shows recoverable UI on an uncaught render error", skip, () => {});
