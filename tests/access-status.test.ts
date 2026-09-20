import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAccessSuspended,
  isAccessPending,
  hasLimitedOrFullAccess,
  hasFullAccess,
  resolveAccessAuditAction,
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

/* ------- resolveAccessAuditAction (Sprint 1 / Phase 2B section 10) --------- */

test("ACCESS-M: resolveAccessAuditAction — anything -> SUSPENDED is always ACCESS_SUSPENDED", () => {
  for (const before of [null, "PENDING_APPROVAL", "LIMITED", "FULL", "SUSPENDED"] as const) {
    assert.equal(resolveAccessAuditAction(before, "SUSPENDED"), "ACCESS_SUSPENDED", `before=${before}`);
  }
});

test("ACCESS-N: resolveAccessAuditAction — SUSPENDED -> anything else is ACCESS_RESTORED", () => {
  assert.equal(resolveAccessAuditAction("SUSPENDED", "FULL"), "ACCESS_RESTORED");
  assert.equal(resolveAccessAuditAction("SUSPENDED", "LIMITED"), "ACCESS_RESTORED");
});

test("ACCESS-O: resolveAccessAuditAction — a plain FULL<->LIMITED adjustment (never through SUSPENDED) is ACCESS_GRANTED", () => {
  assert.equal(resolveAccessAuditAction("FULL", "LIMITED"), "ACCESS_GRANTED");
  assert.equal(resolveAccessAuditAction("LIMITED", "FULL"), "ACCESS_GRANTED");
  assert.equal(resolveAccessAuditAction(null, "FULL"), "ACCESS_GRANTED");
});

/* ----------------------- DB-level integration (route-level) ----------------- */

test(
  "ACCESS-M2: a brand-new employee's FIRST onboarding creates EmployeeProfile with " +
    "accessStatus=PENDING_APPROVAL (not LIMITED) — Sprint 1 / Phase 2B corrected " +
    "semantics; previously onboarding granted LIMITED directly, skipping the " +
    "CLUB_MANAGER approval step entirely",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-N2: PENDING_APPROVAL employee — /api/auth/me resolves (so a waiting " +
    "screen can render) but every operational route (Academy included) returns " +
    "403 ACCESS_PENDING_APPROVAL, never 200",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-O2: POST /api/control/team/[id]/approve on a PENDING_APPROVAL employee " +
    "of the manager's own club sets accessStatus to the requested FULL/LIMITED, " +
    "creates an ACTIVE RoleAssignment{MANAGER, CLUB, that club}, and writes both " +
    "ACCESS_GRANTED and ROLE_ASSIGNED to UserAuditLog",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-P2: POST /api/control/team/[id]/approve on an already-FULL/LIMITED/" +
    "SUSPENDED employee (not PENDING_APPROVAL) is rejected with 409 not_pending " +
    "and changes nothing",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-Q2: POST /api/control/team/[id]/access (setEmployeeAccess) on a " +
    "PENDING_APPROVAL target is rejected with 409 pending_approval — the two " +
    "flows never race into a contradictory state",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "ACCESS-R2: POST /api/control/team/[id]/access with accessStatus=SUSPENDED on a " +
    "FULL employee of the manager's own club sets accessStatus=SUSPENDED and " +
    "audits ACCESS_SUSPENDED; a manager of a DIFFERENT club gets 403 " +
    "employee_not_in_club (same cross-club protection as grant)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

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
