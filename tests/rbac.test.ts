import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGrantActive,
  grantCoversClub,
  grantCoversCity,
  anyGrantCoversClub,
  hasActiveRole,
} from "../src/lib/server/rbac/scope-core";
import {
  hasSystemAccess,
  canAssignRole,
  canRevokeRole,
  authorize,
  isValidGrantShape,
} from "../src/lib/server/rbac/authorize-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";

/**
 * RBAC foundation — pure domain logic (scope-core.ts / authorize-core.ts).
 * No DB, no server-only import, so every scenario here runs for real (no
 * integration skips needed for the decision logic itself). DB-level
 * invariants that require a live Postgres (e.g. the partial unique index
 * rejecting a duplicate ACTIVE row) are explicit skip stubs at the bottom,
 * matching this codebase's established convention for integration scenarios.
 */

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    id: "grant-1",
    role: "MANAGER",
    scopeType: "CLUB",
    cityId: null,
    clubId: null,
    status: "ACTIVE",
    ...overrides,
  };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "user-1",
    appRole: "EMPLOYEE",
    accessStatus: null,
    onboardingCompleted: true,
    employeeClubId: null,
    grants: [],
    ...overrides,
  };
}

/* --------------------------- SYSTEM / NETWORK ---------------------------- */

test("SCOPE-A: a SYSTEM-scope grant covers every club and every city", () => {
  const g = grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" });
  assert.equal(grantCoversClub(g, "club-1", "city-1"), true);
  assert.equal(grantCoversClub(g, "club-99", null), true);
  assert.equal(grantCoversCity(g, "city-1"), true);
});

test("SCOPE-B: a NETWORK-scope grant covers every club and every city", () => {
  const g = grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" });
  assert.equal(grantCoversClub(g, "club-1", "city-1"), true);
  assert.equal(grantCoversCity(g, "any-city"), true);
});

/* ------------------------------ CITY scope -------------------------------- */

test("SCOPE-C: a CITY-scope grant covers a club whose city matches, including one added later", () => {
  const g = grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "nizhny-novgorod" });
  // "Added later" is modeled by simply resolving a club id that never
  // appeared when the grant was created — the check is purely
  // (grant.cityId === targetClubCityId) at call time, so nothing needs to be
  // denormalized when a new club joins the city.
  assert.equal(grantCoversClub(g, "brand-new-club-opened-later", "nizhny-novgorod"), true);
});

test("SCOPE-D: a CITY-scope grant does NOT cover a club in a different city", () => {
  const g = grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "nizhny-novgorod" });
  assert.equal(grantCoversClub(g, "club-in-other-city", "voronezh"), false);
});

test("SCOPE-E: a CITY-scope grant does not cover 'the whole city' via grantCoversCity for a different city", () => {
  const g = grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "nizhny-novgorod" });
  assert.equal(grantCoversCity(g, "nizhny-novgorod"), true);
  assert.equal(grantCoversCity(g, "voronezh"), false);
});

/* ------------------------------ CLUB scope -------------------------------- */

test("SCOPE-F: a CLUB-scope grant covers only that exact club, never its city's other clubs", () => {
  const g = grant({ role: "CITY_MANAGER", scopeType: "CLUB", clubId: "club-1" });
  assert.equal(grantCoversClub(g, "club-1", "nizhny-novgorod"), true);
  assert.equal(grantCoversClub(g, "club-2", "nizhny-novgorod"), false); // same city, different club
  assert.equal(grantCoversCity(g, "nizhny-novgorod"), false); // point exception never covers the whole city
});

test("SCOPE-G: a CLUB_MANAGER's CLUB grant is scoped to their own club only", () => {
  const g = grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" });
  assert.equal(grantCoversClub(g, "club-1", "any-city"), true);
  assert.equal(grantCoversClub(g, "club-2", "any-city"), false);
});

/* --------------------------- Inactive grants ------------------------------ */

test("SCOPE-H: PENDING_APPROVAL / SUSPENDED / ENDED grants authorize nothing", () => {
  for (const status of ["PENDING_APPROVAL", "SUSPENDED", "ENDED"] as const) {
    const g = grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", status });
    assert.equal(isGrantActive(g), false);
    assert.equal(grantCoversClub(g, "any-club", "any-city"), false);
    assert.equal(grantCoversCity(g, "any-city"), false);
  }
});

test("SCOPE-I: anyGrantCoversClub / hasActiveRole across multiple assignments", () => {
  const grants = [
    grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1", status: "ENDED" }),
    grant({ role: "CITY_MANAGER", scopeType: "CLUB", clubId: "club-2" }),
  ];
  assert.equal(anyGrantCoversClub(grants, "CLUB_MANAGER", "club-1", null), false); // ended
  assert.equal(anyGrantCoversClub(grants, "CITY_MANAGER", "club-2", null), true);
  assert.equal(hasActiveRole(grants, "CLUB_MANAGER"), false);
  assert.equal(hasActiveRole(grants, "CITY_MANAGER"), true);
});

/* ------------------------- PROJECT_ADMIN / hasSystemAccess ---------------- */

test("SYSTEM-A: legacy AppRole=ADMIN has system access (compatibility bridge)", () => {
  assert.equal(hasSystemAccess(actor({ appRole: "ADMIN" })), true);
});

test("SYSTEM-B: an active PROJECT_ADMIN/SYSTEM RoleAssignment has system access even with legacy AppRole=EMPLOYEE", () => {
  const a = actor({ appRole: "EMPLOYEE", grants: [grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" })] });
  assert.equal(hasSystemAccess(a), true);
});

test("SYSTEM-C: a SUSPENDED PROJECT_ADMIN grant does not grant system access", () => {
  const a = actor({
    appRole: "EMPLOYEE",
    grants: [grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", status: "SUSPENDED" })],
  });
  assert.equal(hasSystemAccess(a), false);
});

test("SYSTEM-D: an ordinary employee has no system access", () => {
  assert.equal(hasSystemAccess(actor()), false);
});

/* -------- isValidGrantShape (Sprint 1 / Phase 2B — role/scope shape) ------- */

test("SHAPE-A: PROJECT_ADMIN must be SYSTEM scope with no city/club", () => {
  assert.equal(isValidGrantShape({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", cityId: null, clubId: null }), true);
  assert.equal(isValidGrantShape({ role: "PROJECT_ADMIN", scopeType: "NETWORK", cityId: null, clubId: null }), false);
  assert.equal(isValidGrantShape({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", cityId: "voronezh", clubId: null }), false);
});

test("SHAPE-B: OPERATIONS_DIRECTOR must be NETWORK scope with no city/club", () => {
  assert.equal(isValidGrantShape({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", cityId: null, clubId: null }), true);
  assert.equal(isValidGrantShape({ role: "OPERATIONS_DIRECTOR", scopeType: "SYSTEM", cityId: null, clubId: null }), false);
  assert.equal(isValidGrantShape({ role: "OPERATIONS_DIRECTOR", scopeType: "CITY", cityId: "voronezh", clubId: null }), false);
});

test("SHAPE-C: CITY_MANAGER may be CITY (cityId set) or CLUB (point exception, clubId set) — never both, never neither", () => {
  assert.equal(isValidGrantShape({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }), true);
  assert.equal(isValidGrantShape({ role: "CITY_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }), true);
  assert.equal(isValidGrantShape({ role: "CITY_MANAGER", scopeType: "CITY", cityId: null, clubId: null }), false);
  assert.equal(isValidGrantShape({ role: "CITY_MANAGER", scopeType: "NETWORK", cityId: null, clubId: null }), false);
});

test("SHAPE-D: CLUB_MANAGER and MANAGER must be CLUB scope with clubId set and no cityId", () => {
  assert.equal(isValidGrantShape({ role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }), true);
  assert.equal(isValidGrantShape({ role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }), true);
  assert.equal(isValidGrantShape({ role: "CLUB_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }), false);
  assert.equal(isValidGrantShape({ role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: null }), false);
});

test(
  "SHAPE-E: DIRECT ATTACK — a PROJECT_ADMIN (system access) request to create " +
    "{role: CITY_MANAGER, scopeType: NETWORK} (right role, wrong/nonsense scope " +
    "shape) is rejected by canAssignRole even though the top-level " +
    "hasSystemAccess branch only inspects target.role",
  () => {
    const a = actor({ appRole: "ADMIN" });
    assert.equal(canAssignRole(a, { role: "CITY_MANAGER", scopeType: "NETWORK", cityId: null, clubId: null }), false);
    assert.equal(canAssignRole(a, { role: "OPERATIONS_DIRECTOR", scopeType: "CITY", cityId: "voronezh", clubId: null }), false);
  },
);

/* ------------------------------- Assignment -------------------------------- */

test("ASSIGN-A: PROJECT_ADMIN (legacy AppRole=ADMIN) may assign CITY_MANAGER and OPERATIONS_DIRECTOR", () => {
  const a = actor({ appRole: "ADMIN" });
  assert.equal(
    canAssignRole(a, { role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }),
    true,
  );
  assert.equal(
    canAssignRole(a, { role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", cityId: null, clubId: null }),
    true,
  );
});

test("ASSIGN-B: PROJECT_ADMIN may NOT directly assign CLUB_MANAGER or MANAGER (that belongs to CITY_MANAGER/CLUB_MANAGER)", () => {
  const a = actor({ appRole: "ADMIN" });
  assert.equal(
    canAssignRole(a, { role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }),
    false,
  );
});

test("ASSIGN-C: a CITY_MANAGER may assign CLUB_MANAGER inside their city scope", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  const ok = canAssignRole(
    a,
    { role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-in-voronezh" },
    { targetClubCityId: "voronezh" },
  );
  assert.equal(ok, true);
});

test("ASSIGN-D: DIRECT ATTACK — a CITY_MANAGER cannot assign CLUB_MANAGER OUTSIDE their city (cross-city)", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  const ok = canAssignRole(
    a,
    { role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-in-another-city" },
    { targetClubCityId: "nizhny-novgorod" },
  );
  assert.equal(ok, false);
});

test("ASSIGN-E: a CLUB_MANAGER may assign/confirm MANAGER of their own club only", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(
    canAssignRole(a, { role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }),
    true,
  );
});

test("ASSIGN-F: DIRECT ATTACK — a CLUB_MANAGER cannot assign MANAGER in a DIFFERENT club (cross-club)", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(
    canAssignRole(a, { role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-2" }),
    false,
  );
});

test("ASSIGN-G: DIRECT ATTACK — self-promotion is impossible by construction: a CITY_MANAGER cannot assign CITY_MANAGER, OPERATIONS_DIRECTOR, or PROJECT_ADMIN to anyone (including themselves)", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  for (const role of ["CITY_MANAGER", "OPERATIONS_DIRECTOR", "PROJECT_ADMIN"] as const) {
    assert.equal(
      canAssignRole(a, { role, scopeType: role === "CITY_MANAGER" ? "CITY" : role === "OPERATIONS_DIRECTOR" ? "NETWORK" : "SYSTEM", cityId: "voronezh", clubId: null }),
      false,
      `CITY_MANAGER must never be able to assign ${role}`,
    );
  }
});

test("ASSIGN-H: DIRECT ATTACK — a plain MANAGER (no grants) cannot assign any role", () => {
  const a = actor();
  assert.equal(canAssignRole(a, { role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" }), false);
});

/* --------------------------------- Revoke ---------------------------------- */

test("REVOKE-A: CLUB_MANAGER may revoke MANAGER of their own club", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  const target = grant({ role: "MANAGER", scopeType: "CLUB", clubId: "club-1" });
  assert.equal(canRevokeRole(a, target), true);
});

test("REVOKE-B: DIRECT ATTACK — CLUB_MANAGER cannot revoke MANAGER of a different club", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  const target = grant({ role: "MANAGER", scopeType: "CLUB", clubId: "club-2" });
  assert.equal(canRevokeRole(a, target), false);
});

test("REVOKE-C: DIRECT ATTACK — CLUB_MANAGER cannot revoke another CLUB_MANAGER (own club or not)", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  const target = grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1", id: "other" });
  assert.equal(canRevokeRole(a, target), false);
});

test("REVOKE-D: CITY_MANAGER may revoke CLUB_MANAGER and MANAGER inside their scope", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  const cm = grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" });
  const mgr = grant({ role: "MANAGER", scopeType: "CLUB", clubId: "club-1" });
  assert.equal(canRevokeRole(a, cm, { targetClubCityId: "voronezh" }), true);
  assert.equal(canRevokeRole(a, mgr, { targetClubCityId: "voronezh" }), true);
});

test("REVOKE-E: DIRECT ATTACK — CITY_MANAGER cannot revoke a CLUB_MANAGER OUTSIDE their city scope", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  const cm = grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-99" });
  assert.equal(canRevokeRole(a, cm, { targetClubCityId: "nizhny-novgorod" }), false);
});

test("REVOKE-F: DIRECT ATTACK — CITY_MANAGER cannot revoke another CITY_MANAGER or an OPERATIONS_DIRECTOR or PROJECT_ADMIN", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  assert.equal(canRevokeRole(a, grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })), false);
  assert.equal(canRevokeRole(a, grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })), false);
  assert.equal(canRevokeRole(a, grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" })), false);
});

test("REVOKE-G: OPERATIONS_DIRECTOR may revoke any business user except PROJECT_ADMIN", () => {
  const a = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(canRevokeRole(a, grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "any" })), true);
  assert.equal(canRevokeRole(a, grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "any" })), true);
  assert.equal(canRevokeRole(a, grant({ role: "MANAGER", scopeType: "CLUB", clubId: "any" })), true);
});

test("REVOKE-H: DIRECT ATTACK — OPERATIONS_DIRECTOR cannot revoke / manage PROJECT_ADMIN", () => {
  const a = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(canRevokeRole(a, grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" })), false);
});

test("REVOKE-I: PROJECT_ADMIN may revoke any assignment, including OPERATIONS_DIRECTOR and CITY_MANAGER", () => {
  const a = actor({ appRole: "ADMIN" });
  assert.equal(canRevokeRole(a, grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })), true);
  assert.equal(canRevokeRole(a, grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "any" })), true);
  assert.equal(canRevokeRole(a, grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" })), true);
});

/* ------------------------------ authorize() -------------------------------- */

test("AUTHORIZE-A: authorize() dispatches role.assign / role.revoke / system.access identically to the underlying functions", () => {
  const admin = actor({ appRole: "ADMIN" });
  assert.equal(authorize(admin, { action: "system.access" }), true);
  assert.equal(
    authorize(admin, {
      action: "role.assign",
      target: { role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null },
    }),
    true,
  );
  assert.equal(
    authorize(admin, { action: "role.revoke", target: grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" }) }),
    true,
  );

  const nobody = actor();
  assert.equal(authorize(nobody, { action: "system.access" }), false);
});

/* ----------------------- DB-level invariants (integration) ----------------- */

test(
  "DB-A: two concurrently-ACTIVE, otherwise-identical RoleAssignment rows for the same " +
    "(userId, role, scopeType, cityId, clubId) are rejected by the partial unique index " +
    "(role_assignments_active_scope_unique, prisma/migrations/20260817000000_role_assignment_foundation)",
  { skip: "integration: requires Postgres + generated client" },
  () => {},
);

test(
  "DB-B: ending one duplicate-scope assignment (status -> ENDED) allows a fresh ACTIVE " +
    "row for the same scope to be created afterwards",
  { skip: "integration: requires Postgres + generated client" },
  () => {},
);

/* ------------- SYSTEM/CMS compatibility gate (Sprint 1 / Phase 2B) --------- */
/* hasSystemAccess() itself is exhaustively covered above (SYSTEM-A..D) — these
 * document the route/page-level wiring that composes it with a live session,
 * which needs a DB (getActorContext queries RoleAssignment). */

test(
  "SYSTEM-E: every former requireAdmin()-only CMS route (Academy/Scripts/Instructions/" +
    "Metric documents+sync/control/users) now accepts requireSystemAccess() — a " +
    "PROJECT_ADMIN/SYSTEM RoleAssignment holder with legacy AppRole=EMPLOYEE succeeds " +
    "exactly like AppRole=ADMIN did before",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "SYSTEM-F: requireSPMAccess()/requireSPM() are unaffected by an active PROJECT_ADMIN " +
    "grant — a PROJECT_ADMIN without legacy AppRole=ADMIN or SPM still gets 403 from " +
    "every /api/spm/** route (SPM stays a separate, untouched legacy axis)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "SYSTEM-G: the /admin and /control/{scripts,instructions,metric,metric/documents,users} " +
    "page shells render their content (not AccessDenied) for a PROJECT_ADMIN/SYSTEM grant " +
    "holder, and ControlShell shows the CMS nav items, exactly like legacy AppRole=ADMIN",
  { skip: "integration: requires Postgres + running server + DOM" },
  () => {},
);

/* ------------------- Role Assignment API (Sprint 1 / Phase 2B) ------------- */

test(
  "API-A: GET /api/control/roles returns only assignments within the caller's " +
    "visibility scope (visibilityFilter) — a CLUB_MANAGER sees only their club's " +
    "rows, a CITY_MANAGER sees their city's CITY-scoped rows plus every CLUB-scoped " +
    "row inside that city (including a club added to the city after the grant was " +
    "made), and a plain MANAGER with no active grant gets 403, never an empty 200",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "API-B: POST /api/control/roles rejects a body whose shape/hierarchy authorize() " +
    "denies with 403 (never a 500), and a body creating a duplicate ACTIVE scope " +
    "with 409 assignment_already_active (pre-check) — a forced race that reaches the " +
    "DB anyway is still caught (P2002 -> 409, never a raw 500)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "API-C: POST /api/control/roles/[id]/revoke on a CITY_MANAGER's only active " +
    "grant also flips EmployeeProfile.accessStatus to SUSPENDED (hasAnyActiveWorkingAssignment " +
    "returns false) and audits a separate ACCESS_SUSPENDED entry in the same " +
    "transaction; revoking one of TWO active grants leaves accessStatus untouched",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "API-D: POST /api/control/roles/[id]/restore refuses (409) when an ACTIVE " +
    "duplicate-scope row already exists (collision guard mirrors the partial " +
    "unique index) and never touches EmployeeProfile.accessStatus even if the " +
    "matching revoke had auto-suspended it",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "API-E: DIRECT ATTACK — a CLUB_MANAGER POSTs /api/control/roles with " +
    "{role: CITY_MANAGER, scopeType: CITY, cityId: <any>} (self-promotion via the " +
    "raw API, bypassing any UI) -> 403, RoleAssignment table unchanged",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
