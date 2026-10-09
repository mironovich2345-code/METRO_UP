import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  grantCoversCityOrItsClubs,
  anyGrantCoversCityOrItsClubs,
  anyGrantCoversClub,
  cabinetAccessCoversClub,
  isManagerPersonaPreview,
} from "../src/lib/server/rbac/scope-core";
import type { RoleGrant } from "../src/lib/server/rbac/types";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

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
    "tier 3 only matches the actor's OWN active CLUB_MANAGER grant; tier 4 " +
    "requires real club.read authority, which a plain CLUB_MANAGER never has " +
    "for a club outside their own grant — tier 2, the legacy-manager check, " +
    "also never matches since EmployeeProfile.clubId is club A, not B)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

/* --------------------------- Round B.1, section 1 (P0 fix) --------------------------- */

test(
  "CLM-DASH-H: Round B.1 fix — a legacy AppRole=CLUB_MANAGER (EmployeeProfile." +
    "clubId, NO RoleAssignment row at all) reading GET /api/control/cabinet/" +
    "club-manager?clubId=<their own club> gets 200 with that club's dashboard " +
    "via tier 2. This was the exact P0 bug: GET /api/control/club/clubs " +
    "already correctly listed this club for them (resolveClubManagerClubs' " +
    "own legacy recognition), but every actual read of it 403'd, because " +
    "resolveClubManagerCabinetAccess had no equivalent tier — only tiers 3/4, " +
    "both RoleAssignment/authorize()-based — before this fix",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-DASH-I: the SAME legacy manager's team roster (GET .../club-manager/" +
    "team?clubId=<their own club>) also succeeds via the same tier 2 fix — " +
    "the two routes agree again, as resolveClubManagerCabinetAccess's own " +
    "doc comment claims",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-DASH-J: a legacy AppRole=CLUB_MANAGER attempting clubId=<a club they " +
    "do NOT personally work at> still 403s — tier 2 matches EmployeeProfile." +
    "clubId EXACTLY, never any other club; this is not a backdoor to every " +
    "club in the network",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test("CLM-DASH-WIRE-A: resolveClubManagerCabinetAccess's legacy-manager tier 2 (user.role===\"CLUB_MANAGER\" && user.employeeProfile?.clubId===requestedClubId) is checked BEFORE tier 3's RoleAssignment-grant lookup — the exact fix for the P0 'real CLUB_MANAGER sees Раздел недоступен' bug, verifiable without a live database", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  const fnStart = src.indexOf("export async function resolveClubManagerCabinetAccess");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  const legacyCheckIdx = fnSrc.indexOf('user.role === "CLUB_MANAGER" && user.employeeProfile?.clubId === requestedClubId');
  const grantCheckIdx = fnSrc.indexOf("ownsClubManagerGrant");
  assert.ok(legacyCheckIdx > 0 && grantCheckIdx > legacyCheckIdx, "expected the legacy-manager tier before the RoleAssignment-grant tier");
});

test("CLM-DASH-WIRE-B: the legacy-manager tier returns isPreviewing:false — it is a REAL read by the real user, never mistaken for a View-As preview (which would wrongly make it eligible for the global preview-read semantics elsewhere)", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  const fnStart = src.indexOf("export async function resolveClubManagerCabinetAccess");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  const legacyCheckIdx = fnSrc.indexOf('user.role === "CLUB_MANAGER" && user.employeeProfile?.clubId === requestedClubId');
  const nextReturnIdx = fnSrc.indexOf("return {", legacyCheckIdx);
  const returnSrc = fnSrc.slice(nextReturnIdx, fnSrc.indexOf("}", nextReturnIdx) + 1);
  assert.match(returnSrc, /isPreviewing: false/);
  assert.match(returnSrc, /effectiveUser: user/);
});

test("CLM-DASH-WIRE-C: resolveClubManagerCabinetAccess has exactly ONE caller site family — the two GET cabinet routes — never a mutation/write route, so this fix cannot have widened any write authorization (View-As mutation-blocking, src/middleware.ts, is untouched — see VIEWAS-CAB-D above)", () => {
  const dashboardRoute = read("src/app/api/control/cabinet/club-manager/route.ts");
  const teamRoute = read("src/app/api/control/cabinet/club-manager/team/route.ts");
  assert.match(dashboardRoute, /export async function GET\(/);
  assert.doesNotMatch(dashboardRoute, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.match(teamRoute, /export async function GET\(/);
  assert.doesNotMatch(teamRoute, /export async function (POST|PUT|PATCH|DELETE)\(/);
});

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

/**
 * Sprint: REMEDIATION R2.2 — this test previously predicted (hedged as
 * "correctly 403 UNLESS...") exactly the leak R2.2 found and closed:
 * resolveClubManagerCabinetAccess's tier 1 is CLUB_MANAGER-preview-only, so
 * a MANAGER preview fell through to tier 4 (club.read), which a real
 * CITY_MANAGER's own scope satisfies for any club they manage — including
 * club X itself. requireNoManagerPersonaPreview (effective-context.ts) now
 * denies BEFORE resolveClubManagerCabinetAccess runs, so the hedge no
 * longer applies: this is unconditionally 403 now, regardless of the real
 * actor's own authority. Pure decision coverage: MGRPERSONA-A..F
 * (cabinet-dashboards.test.ts, same file, above).
 */
test(
  "VIEWAS-CAB-C: a CITY_MANAGER with an active View-As-MANAGER-of-club-X " +
    "preview reading the SAME club-manager cabinet endpoint does NOT get club " +
    "X's management data via that preview — UNCONDITIONALLY denied now " +
    "(requireNoManagerPersonaPreview, R2.2), even when the real actor's own " +
    "scope would otherwise satisfy tier 4's club.read for club X",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test("VIEWAS-CAB-C-WIRE: both club-manager/route.ts and club-manager/team/route.ts call requireNoManagerPersonaPreview BEFORE resolveClubManagerCabinetAccess — the exact fix VIEWAS-CAB-C above now relies on", () => {
  for (const file of ["src/app/api/control/cabinet/club-manager/route.ts", "src/app/api/control/cabinet/club-manager/team/route.ts"]) {
    const src = read(file);
    const guardIdx = src.indexOf("requireNoManagerPersonaPreview(user)");
    const tierIdx = src.indexOf("resolveClubManagerCabinetAccess(user, clubIdParam)");
    assert.ok(guardIdx > 0, `${file}: requireNoManagerPersonaPreview must be called`);
    assert.ok(tierIdx > guardIdx, `${file}: the guard must run before resolveClubManagerCabinetAccess`);
  }
});

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

/* ------------------- Management Round E0, section 1 (P0 re-trace) ------------------- */

test("CLM-DASH-WIRE-D: tier 3's RoleAssignment-grant check still requires status===\"ACTIVE\" literally — a revoked/suspended/ended CLUB_MANAGER grant for the exact requested club never matches (section 12's 'revoked access denied' requirement), unweakened by this round's changes", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /g\.role === "CLUB_MANAGER" && g\.status === "ACTIVE" && g\.clubId === requestedClubId/);
});

/*
 * Sprint: REMEDIATION R2, F-04 — employee-training's own authorization is now
 * resolveClubManagerCabinetAccess + cabinetAccessCoversClub (the generic
 * club.read + isOwnLegacyClub pair TEAM-E0-A/B/WIRE used to describe was
 * replaced outright, not layered on top of). The old parallel check never
 * consulted an active View-As CLUB_MANAGER preview at all — a CITY_MANAGER
 * previewing as CLUB_MANAGER of Club A could still open an employee's card
 * in Club B via their own real, broader club.read scope. Legacy
 * AppRole=CLUB_MANAGER's "own club" recognition (the original P0 TEAM-E0
 * fix) is preserved, just via resolveClubManagerCabinetAccess's own tier 2
 * (already proven by CLM-DASH-H/I/J above) instead of a second, divergent
 * inline copy of the same rule.
 */

test("CABACCESS-A: cabinetAccessCoversClub is false for a null access (resolveClubManagerCabinetAccess found no applicable tier) — never treated as an open allow", () => {
  assert.equal(cabinetAccessCoversClub(null, "club-1"), false);
});

test("CABACCESS-B: cabinetAccessCoversClub is true when the resolved access's clubId matches the requested target club exactly", () => {
  assert.equal(cabinetAccessCoversClub({ clubId: "club-1" }, "club-1"), true);
});

test("CABACCESS-C: THE F-04 FIX — cabinetAccessCoversClub is false when the resolved access's clubId does NOT match the target club, even though access is non-null. This is the exact View-As-pinning scenario: an active View-As CLUB_MANAGER-of-Club-A preview makes resolveClubManagerCabinetAccess's tier 1 unconditionally return clubId='club-A' — requesting an employee in 'club-B' must be denied, never silently allowed because SOME access was resolved", () => {
  assert.equal(cabinetAccessCoversClub({ clubId: "club-A" }, "club-B"), false);
});

/*
 * Sprint: REMEDIATION R2.1 — a genuine View-As MANAGER persona has NO
 * management Employee Card access at all. Traced (not assumed from a
 * comment): resolveClubManagerCabinetAccess's tier 1 is CLUB_MANAGER-
 * preview-only, so a MANAGER preview never matches it and falls all the
 * way through to tier 4 (club.read), which checks the REAL actor's own
 * grants with zero awareness a persona substitution is active. A
 * CITY_MANAGER with real scope covering Club A + Club B, previewing as
 * MANAGER of Club A, could therefore open EITHER club's Employee Card —
 * tier 4 resolves access for both. isManagerPersonaPreview closes this by
 * being checked BEFORE resolveClubManagerCabinetAccess ever runs.
 */

test("MGRPERSONA-A: isManagerPersonaPreview is true only for an ACTIVE, genuine MANAGER persona preview — previewRole alone (without isPreviewing) and isPreviewing alone (without previewRole='MANAGER') must not trigger it", () => {
  assert.equal(isManagerPersonaPreview(true, "MANAGER"), true);
  assert.equal(isManagerPersonaPreview(true, "CLUB_MANAGER"), false);
  assert.equal(isManagerPersonaPreview(false, null), false);
  assert.equal(isManagerPersonaPreview(false, "MANAGER"), false, "isPreviewing must gate it — a stale/absent previewRole string alone proves nothing");
  // Defensive only: effective-context.ts's isPersonaPreview already excludes a
  // CITY_MANAGER self-preview from ever setting isPreviewing=true, so this
  // input combination should never actually occur — but the predicate itself
  // must not special-case trust that upstream invariant a second time.
  assert.equal(isManagerPersonaPreview(true, "CITY_MANAGER"), false);
});

/**
 * THE FULL MATRIX (R2.1 brief, section 3) — composed exactly as the route
 * calls these two real, pure functions, in order: isManagerPersonaPreview
 * first (new this round), then cabinetAccessCoversClub (R2) against
 * whatever resolveClubManagerCabinetAccess WOULD resolve for each row —
 * traced by hand against its actual tier branches (see employee-training/
 * route.ts's own header comment for that trace). access={clubId:"club-A"}
 * for a request against club-A and access={clubId:"club-B"} for a request
 * against club-B are both exactly what tier 4 (club.read) resolves for a
 * real CITY_MANAGER whose scope covers both clubs — this is not a guess,
 * it is what authorize(actor,{action:"club.read"}) returns for any club
 * within an ACTIVE CITY_MANAGER grant's scope (rbac.test.ts's READ-E and
 * canReadClub's own definition in authorize-core.ts).
 */
function employeeTrainingDecision(
  effective: { isPreviewing: boolean; previewRole: "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER" | null },
  access: { clubId: string } | null,
  targetClubId: string,
): boolean {
  if (isManagerPersonaPreview(effective.isPreviewing, effective.previewRole)) return false;
  return cabinetAccessCoversClub(access, targetClubId);
}

test("MGRPERSONA-B: real CITY_MANAGER (scope club-A + club-B), View-As MANAGER of club-A — employee club-A AND employee club-B are BOTH denied, even though tier 4's club.read would otherwise resolve access for both (the exact leak this round closes)", () => {
  const effective = { isPreviewing: true, previewRole: "MANAGER" as const };
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-A" }, "club-A"), false);
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-B" }, "club-B"), false);
});

test("MGRPERSONA-C: real CITY_MANAGER, View-As CLUB_MANAGER of club-A — employee club-A allowed, employee club-B denied (tier 1 pins to A — R2's CABACCESS-C, unchanged by this round)", () => {
  const effective = { isPreviewing: true, previewRole: "CLUB_MANAGER" as const };
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-A" }, "club-A"), true);
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-A" }, "club-B"), false);
});

test("MGRPERSONA-D: NO genuine persona preview, real CITY_MANAGER scope club-A + club-B — employee club-B is allowed (tier 4, real authority fully preserved, not globally suppressed)", () => {
  const effective = { isPreviewing: false, previewRole: null };
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-B" }, "club-B"), true);
});

test("MGRPERSONA-E: real CLUB_MANAGER of club-A (no preview at all) — employee club-A allowed, employee club-B denied, exactly the pre-existing non-preview CLUB_MANAGER behavior, confirming this fix changes nothing when no persona preview is active", () => {
  const effective = { isPreviewing: false, previewRole: null };
  assert.equal(employeeTrainingDecision(effective, { clubId: "club-A" }, "club-A"), true);
  assert.equal(employeeTrainingDecision(effective, null, "club-B"), false);
});

test(
  "MGRPERSONA-F: a plain MANAGER (no grant, no preview at all) is denied for both club-A and club-B — resolveClubManagerCabinetAccess resolves null (no tier matches), cabinetAccessCoversClub(null, ...) is false regardless of isManagerPersonaPreview",
  () => {
    const effective = { isPreviewing: false, previewRole: null };
    assert.equal(employeeTrainingDecision(effective, null, "club-A"), false);
    assert.equal(employeeTrainingDecision(effective, null, "club-B"), false);
  },
);

test(
  "TEAM-E0-A: a legacy AppRole=CLUB_MANAGER clicking from their OWN roster " +
    "into one of their OWN employees' training detail (GET /api/control/" +
    "cabinet/employee-training?userId=<own employee>) succeeds via " +
    "resolveClubManagerCabinetAccess's tier 2 (legacy identity) — the P0 'Team " +
    "access' fix, now resolved by the shared helper instead of a second inline copy",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "TEAM-E0-B: the SAME legacy manager requesting a DIFFERENT club's employee " +
    "(not their own) still 403s — tier 2 matches EmployeeProfile.clubId " +
    "EXACTLY, never any other club; a real (non-previewing) CITY_MANAGER's " +
    "own broader club.read authority (tier 4) is unweakened for every other " +
    "club in their real scope",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "TEAM-E0-C: Sprint: REMEDIATION R2, F-04 — a CITY_MANAGER with real scope " +
    "covering Club A + Club B, previewing as View-As CLUB_MANAGER of Club A, " +
    "requesting GET employee-training?userId=<an employee of Club B> now " +
    "gets 403 — tier 1 pins to Club A regardless of the real actor's broader " +
    "scope, and cabinetAccessCoversClub (CABACCESS-C above) rejects the " +
    "mismatch; the SAME request with NO preview active still succeeds " +
    "(tier 4, real scope, unchanged)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "TEAM-E0-D: Sprint: REMEDIATION R2.1 — a CITY_MANAGER with real scope " +
    "covering Club A + Club B, previewing as View-As MANAGER of Club A, " +
    "requesting GET employee-training for EITHER club A's or club B's " +
    "employee now gets 403 — isManagerPersonaPreview denies before " +
    "resolveClubManagerCabinetAccess ever runs; the pure decision logic " +
    "itself is real-tested (MGRPERSONA-A..F above), this names the full " +
    "HTTP-level claim the brief's Direct URL matrix also covers",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test("TEAM-E0-WIRE: employee-training checks isManagerPersonaPreview (scope-core.ts, pure, directly unit-tested above) BEFORE resolving access via resolveClubManagerCabinetAccess (cabinet-dashboards.ts's reused, unmodified 4-tier resolver), and gates that result on cabinetAccessCoversClub — never a parallel, divergent authorization rule", () => {
  const src = read("src/app/api/control/cabinet/employee-training/route.ts");
  const managerCheckIdx = src.indexOf("isManagerPersonaPreview(");
  const resolveAccessIdx = src.indexOf("resolveClubManagerCabinetAccess(user, target.clubId)");
  assert.ok(managerCheckIdx > 0, "isManagerPersonaPreview must be called");
  assert.ok(resolveAccessIdx > managerCheckIdx, "the MANAGER-persona check must run BEFORE resolveClubManagerCabinetAccess, not after — its return value alone cannot distinguish a fallen-through MANAGER preview from no preview at all");
  assert.match(src, /cabinetAccessCoversClub\(access, target\.clubId\)/);
  assert.doesNotMatch(src, /isOwnLegacyClub/, "the old parallel legacy-club check must be fully removed, not layered on top of the new one");
});
