import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAccessSuspended,
  isAccessPending,
  hasLimitedOrFullAccess,
  hasFullAccess,
} from "../src/lib/server/access-status-logic";

/**
 * ACCESS STATUS enforcement — pure threshold predicates (no DB / server-only
 * import, so every combination below runs for real). authz.ts's
 * requireActiveAccess/requireLimitedOrFullAccess/requireFullAccess compose
 * these with requireEmployeeProfile() — the DB-touching part is exercised
 * only by the route-level integration tests (skip stubs at the bottom,
 * matching this codebase's established convention).
 *
 * Exhaustive matrix: all 4 AccessStatus values x the 3 guard tiers.
 */

const ALL_STATUSES = ["PENDING_APPROVAL", "LIMITED", "FULL", "SUSPENDED"] as const;

test("ACCESS-A: isAccessSuspended is true for SUSPENDED only", () => {
  for (const s of ALL_STATUSES) {
    assert.equal(isAccessSuspended(s), s === "SUSPENDED", `status=${s}`);
  }
  assert.equal(isAccessSuspended(null), false);
  assert.equal(isAccessSuspended(undefined), false);
});

test("ACCESS-B: isAccessPending is true for PENDING_APPROVAL only", () => {
  for (const s of ALL_STATUSES) {
    assert.equal(isAccessPending(s), s === "PENDING_APPROVAL", `status=${s}`);
  }
  assert.equal(isAccessPending(null), false);
});

test("ACCESS-C: hasLimitedOrFullAccess (Academy whitelist tier) — true for LIMITED and FULL only", () => {
  assert.equal(hasLimitedOrFullAccess("LIMITED"), true);
  assert.equal(hasLimitedOrFullAccess("FULL"), true);
  assert.equal(hasLimitedOrFullAccess("PENDING_APPROVAL"), false);
  assert.equal(hasLimitedOrFullAccess("SUSPENDED"), false);
  assert.equal(hasLimitedOrFullAccess(null), false);
  assert.equal(hasLimitedOrFullAccess(undefined), false);
});

test("ACCESS-D: hasFullAccess (default operational tier) — true for FULL only", () => {
  assert.equal(hasFullAccess("FULL"), true);
  assert.equal(hasFullAccess("LIMITED"), false);
  assert.equal(hasFullAccess("PENDING_APPROVAL"), false);
  assert.equal(hasFullAccess("SUSPENDED"), false);
  assert.equal(hasFullAccess(null), false);
});

/* ------------------- The exact scenarios named in the plan ------------------ */

test("ACCESS-E: PENDING is denied operational functionality (both the Academy whitelist and the default FULL tier)", () => {
  assert.equal(hasLimitedOrFullAccess("PENDING_APPROVAL"), false); // -> Academy denied
  assert.equal(hasFullAccess("PENDING_APPROVAL"), false); // -> Daily Plan/Metric/etc. denied
});

test("ACCESS-F: LIMITED — Academy allowed, Metric (default FULL tier) denied", () => {
  assert.equal(hasLimitedOrFullAccess("LIMITED"), true); // Academy: requireLimitedOrFullAccess -> passes
  assert.equal(hasFullAccess("LIMITED"), false); // Metric/Daily Plan/etc.: requireFullAccess -> denied
});

test("ACCESS-G: FULL — normal, passes every tier", () => {
  assert.equal(hasLimitedOrFullAccess("FULL"), true);
  assert.equal(hasFullAccess("FULL"), true);
  assert.equal(isAccessSuspended("FULL"), false);
});

test("ACCESS-H: SUSPENDED — denied at every tier, including the most permissive (requireActiveAccess)", () => {
  assert.equal(isAccessSuspended("SUSPENDED"), true); // requireActiveAccess -> denied
  assert.equal(hasLimitedOrFullAccess("SUSPENDED"), false); // requireLimitedOrFullAccess -> denied
  assert.equal(hasFullAccess("SUSPENDED"), false); // requireFullAccess -> denied
});

/* ----------------------- DB-level integration (route-level) ----------------- */

test(
  "ACCESS-I: SUSPENDED employee calling Metric/Academy/Daily Plan/Scripts/Instructions/XP/Rating " +
    "directly (bypassing the UI) receives 403 APP_TEMPORARILY_UNAVAILABLE from every one, never 200 " +
    "and never HTTP 503",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-J: LIMITED employee can reach Academy (overview/lessons/quiz) but gets 403 ACCESS_LIMITED " +
    "from home/xp/rating/achievements/plan/metric/scripts/instructions",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-K: PENDING_APPROVAL employee gets 403 ACCESS_PENDING_APPROVAL from Academy and everything else " +
    "operational, but /api/auth/me still resolves (so a waiting screen can render)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-L: /api/control/** and /api/spm/** routes are unaffected by accessStatus — a CLUB_MANAGER/SPM/" +
    "ADMIN account with no EmployeeProfile (accessStatus=null) continues to work exactly as before",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
