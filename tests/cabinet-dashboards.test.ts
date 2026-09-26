import { test } from "node:test";
import assert from "node:assert/strict";
import {
  grantCoversCityOrItsClubs,
  anyGrantCoversCityOrItsClubs,
  anyGrantCoversClub,
} from "../src/lib/server/rbac/scope-core";
import type { RoleGrant } from "../src/lib/server/rbac/types";

/**
 * Sprint: role-cabinets, step 4 — OPERATIONS_DIRECTOR / CITY_MANAGER /
 * CLUB_MANAGER cabinet read models (src/lib/server/rbac/cabinet-dashboards.ts
 * + src/app/api/control/cabinet/*).
 *
 * The two NEW pure decision functions this step adds to scope-core.ts
 * (grantCoversCityOrItsClubs / anyGrantCoversCityOrItsClubs — "does a city
 * have ANY manager attention at all", the composed predicate behind the
 * CITY_WITHOUT_CITY_MANAGER attention check) are tested for real below, no
 * DB required. CLUB_WITHOUT_CLUB_MANAGER reuses the already-tested
 * anyGrantCoversClub (scope-core.ts, covered by rbac.test.ts's SCOPE-I) —
 * one confirmation test here ties it explicitly to this step's usage.
 *
 * Everything else in cabinet-dashboards.ts is DB-touching orchestration
 * (batched Prisma queries assembling the actual dashboards) — the sections
 * 19-22 scenarios below are skip stubs, matching this codebase's established
 * integration-test convention. Query-shape claims (batched, not N+1) are
 * verified by code review (documented per-function in cabinet-dashboards.ts)
 * and are re-stated here as explicit, traceable test names — never asserted
 * as "passing" without a live DB to actually count round-trips against.
 */

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "grant-1", role: "CITY_MANAGER", scopeType: "CITY", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}

/* --------- grantCoversCityOrItsClubs / anyGrantCoversCityOrItsClubs ------- */

test("CABCITY-A: a CITY-scope grant for the city covers it directly", () => {
  const g = grant({ scopeType: "CITY", cityId: "voronezh" });
  assert.equal(grantCoversCityOrItsClubs(g, "voronezh", ["club-1", "club-2"]), true);
});

test("CABCITY-B: a CLUB-scope point-exception grant for ONE club in the city also counts as covering the city (broader than grantCoversCity alone)", () => {
  const g = grant({ scopeType: "CLUB", cityId: null, clubId: "club-1" });
  assert.equal(grantCoversCityOrItsClubs(g, "voronezh", ["club-1", "club-2"]), true);
});

test("CABCITY-C: a CLUB-scope grant for a club NOT in this city does not cover it", () => {
  const g = grant({ scopeType: "CLUB", cityId: null, clubId: "club-in-kazan" });
  assert.equal(grantCoversCityOrItsClubs(g, "voronezh", ["club-1", "club-2"]), false);
});

test("CABCITY-D: a SUSPENDED/ENDED grant never covers anything, even if its scope would otherwise match", () => {
  const g = grant({ scopeType: "CITY", cityId: "voronezh", status: "SUSPENDED" });
  assert.equal(grantCoversCityOrItsClubs(g, "voronezh", ["club-1"]), false);
});

test("CABCITY-E: anyGrantCoversCityOrItsClubs is true when ANY one grant in a mixed list covers the city — multiple CITY_MANAGER assignments for the same city are all considered, never just the first", () => {
  const grants = [
    grant({ id: "g1", scopeType: "CLUB", cityId: null, clubId: "club-in-kazan" }), // doesn't cover
    grant({ id: "g2", scopeType: "CITY", cityId: "voronezh" }), // covers
  ];
  assert.equal(anyGrantCoversCityOrItsClubs(grants, "voronezh", ["club-1"]), true);
});

test("CABCITY-F: anyGrantCoversCityOrItsClubs is false for an empty grant list or when none match — the CITY_WITHOUT_CITY_MANAGER case", () => {
  assert.equal(anyGrantCoversCityOrItsClubs([], "voronezh", ["club-1"]), false);
  assert.equal(
    anyGrantCoversCityOrItsClubs([grant({ scopeType: "CLUB", cityId: null, clubId: "club-elsewhere" })], "voronezh", ["club-1"]),
    false,
  );
});

test("CABCLUB-A: CLUB_WITHOUT_CLUB_MANAGER reuses anyGrantCoversClub (scope-core.ts) unchanged — a club with zero active CLUB_MANAGER grants is correctly flagged, one with an active grant is not", () => {
  const grants: RoleGrant[] = [grant({ id: "cm1", role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: "club-1" })];
  assert.equal(anyGrantCoversClub(grants, "CLUB_MANAGER", "club-1", "voronezh"), true);
  assert.equal(anyGrantCoversClub(grants, "CLUB_MANAGER", "club-2", "voronezh"), false);
});

/* ------------------------- OPERATIONS_DIRECTOR dashboard ------------------ */

test(
  "OD-DASH-A: GET /api/control/cabinet/operations-director returns cityCount/" +
    "clubCount/employeeCount/cityManagerCount/pendingApprovalCount matching " +
    "real DB rows, network-wide, for both legacy-ADMIN and an active " +
    "OPERATIONS_DIRECTOR grant",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-B: the dashboard's per-city list includes EVERY active city, and " +
    "sums each city's own clubs' employeeCount correctly (no cross-city leakage)",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-C: a city covered by TWO different active CITY_MANAGER assignments " +
    "reports activeCityManagerCount=2 and both users in cityManagers — never " +
    "assumes one city = one CITY_MANAGER",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-D: a city with zero covering CITY_MANAGER grants produces exactly " +
    "one CITY_WITHOUT_CITY_MANAGER attention item for that city",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-E: a club with zero covering CLUB_MANAGER grants produces exactly " +
    "one CLUB_WITHOUT_CLUB_MANAGER attention item for that club",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-F: every EmployeeProfile with accessStatus=PENDING_APPROVAL " +
    "produces exactly one PENDING_EMPLOYEE_APPROVAL attention item, network-wide",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-G: DIRECT ATTACK — a plain MANAGER (no grants) requesting GET " +
    "/api/control/cabinet/operations-director gets 403, never the network model",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "OD-DASH-H: EMPTY NETWORK — zero cities/clubs/employees/CITY_MANAGER grants " +
    "in the DB returns 200 with summary all-zero, training=null, attention=[], " +
    "cities=[] — never a 500",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "OD-DASH-I: QUERY SHAPE — building the full network dashboard issues a " +
    "constant, small number of queries independent of employee count (city+" +
    "clubs, one employees findMany, one CITY_MANAGER findMany, one " +
    "CLUB_MANAGER findMany, one lesson count, one lessonProgress groupBy, " +
    "plus small display-name lookups) — never one query per club or per " +
    "employee. Documented in cabinet-dashboards.ts's header comment; " +
    "asserting the actual round-trip count needs a live Postgres query-log " +
    "capture, not exercised here",
  { skip: "integration: requires Postgres + query logging" },
  () => {},
);

/* ---------------------------- CITY_MANAGER dashboard ----------------------- */

test(
  "CM-DASH-A: CITY scope returns every club CURRENTLY in that city via " +
    "resolveCityManagerClubs (reused unchanged, dynamic at read time)",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-B: a club added to the city AFTER the CITY_MANAGER grant was " +
    "created is included on the very next read — no denormalized membership " +
    "to go stale",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-C: a CLUB-scope (point-exception) CITY_MANAGER grant returns only " +
    "that explicit club, never the rest of the city",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-D: two DIFFERENT CITY_MANAGER users both covering the same city " +
    "each independently get a correct dashboard for it via their own grant",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-E: DIRECT ATTACK — a CITY_MANAGER scoped to city A cannot see city " +
    "B's clubs/employees/attention through this dashboard",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-F: a club in scope with no active CLUB_MANAGER produces a " +
    "CLUB_WITHOUT_CLUB_MANAGER attention item scoped to that club",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CM-DASH-G: DIRECT ATTACK — a plain MANAGER (no CITY_MANAGER grant) " +
    "requesting this endpoint gets 403",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

/* ---------------------------- CLUB_MANAGER dashboard ----------------------- */

test(
  "CLM-DASH-A: a CLUB_MANAGER sees only their own club's summary/attention/" +
    "plan — never another club's",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CLM-DASH-B: the team roster (GET .../club-manager/team) lists exactly the " +
    "requesting club's employees (role=EMPLOYEE, EmployeeProfile.clubId " +
    "match) — an employee from a different club never appears",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CLM-DASH-C: PENDING_APPROVAL employees produce attention items scoped to " +
    "this club; the summary's pendingApprovalCount matches",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CLM-DASH-D: DIRECT ATTACK — a CLUB_MANAGER of club A cannot read club B's " +
    "dashboard or team roster via clubId= (resolveClubManagerCabinetAccess's " +
    "tier 2 only matches the actor's OWN active CLUB_MANAGER grant; tier 3 " +
    "requires real club.read authority, which a plain CLUB_MANAGER never has " +
    "for a club outside their own grant)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-DASH-E: an employee with zero LessonProgress rows shows " +
    "progressPercent computed from 0 completed (not null, not a crash) when " +
    "totalPublishedLessons > 0, and null only when totalPublishedLessons = 0",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CLM-DASH-F: an employee with zero QuizAttempt rows shows " +
    "latestTestResult=null, never a crash or a fabricated result",
  { skip: "integration: requires Postgres" },
  () => {},
);

test(
  "CLM-DASH-G: EMPTY CLUB — zero employees returns 200 with summary all-zero, " +
    "training=null, attention=[], team members=[] — never a 500",
  { skip: "integration: requires Postgres" },
  () => {},
);

/* --------------------------------- View As --------------------------------- */

test(
  "VIEWAS-CAB-A: a CITY_MANAGER with an active View-As-CLUB_MANAGER-of-club-X " +
    "preview reading GET /api/control/cabinet/club-manager (no clubId param " +
    "needed) gets EXACTLY club X's dashboard — resolveClubManagerCabinetAccess " +
    "tier 1 — even if the real CITY_MANAGER's own scope covers other clubs too",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "VIEWAS-CAB-B: the same preview's team roster (GET .../club-manager/team) " +
    "never includes employees from any club outside X — no scope leakage " +
    "through the second endpoint",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "VIEWAS-CAB-C: a CITY_MANAGER with an active View-As-MANAGER-of-club-X " +
    "preview reading the SAME club-manager cabinet endpoint does NOT get club " +
    "X's management data via that preview — resolveClubManagerCabinetAccess's " +
    "tier 1 is CLUB_MANAGER-preview-only by design (Sprint: role-cabinets, " +
    "step 4, section 13/22); it falls through to tiers 2/3, which check the " +
    "REAL actor's own authority and correctly 403 unless that real actor " +
    "separately also holds a real grant/club.read authority for club X",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "VIEWAS-CAB-D: during any View As preview, the cabinet endpoints remain " +
    "READ-ONLY — POST/PUT/PATCH/DELETE to any /api/control/* path is already " +
    "blocked network-wide by src/middleware.ts (unchanged this step); no " +
    "cabinet route in this step defines a mutation handler at all",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "VIEWAS-CAB-E: the ClubManagerDashboard's `plan` field, when served via an " +
    "active CLUB_MANAGER preview, is the synthetic persona's honest empty " +
    "plan (getPlanTodayFor's isPreviewing=true branch — no DailyTask " +
    "materialization for a non-existent user), not the real CITY_MANAGER's " +
    "own plan and not a fabricated one",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
