import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  hasActiveRole,
  anyGrantCoversClub,
  resolveManagerEligibleClubIds,
  resolveManagerRequestedClub,
} from "../src/lib/server/rbac/scope-core";
import type { RoleGrant } from "../src/lib/server/rbac/types";
import type { AppRole } from "@prisma/client";
import { canManageClub } from "../src/lib/roles";
import { resolvePlanScopeUiState } from "../src/lib/control-plan-ui";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Sprint: REMEDIATION R4, F-05 — the exhaustive audit found that desktop
 * /control's Plan (GET /api/control/plan, POST .../plan/tasks, DELETE
 * .../plan/tasks/[id]) and Templates (POST .../templates, PATCH
 * .../templates/[id], POST .../templates/reorder) routes gated on
 * requireClubManager (legacy AppRole=CLUB_MANAGER/ADMIN only), while the
 * sibling Team actions (.../team/[id]/approve, .../team/[id]/access)
 * already gated on requireClubManagerAccess (legacy OR an active
 * CLUB_MANAGER RoleAssignment grant). A grant-only CLUB_MANAGER could
 * manage employee access but not use Plan/Templates in the same portal.
 * Fixed by swapping all six routes' gate, plus one downstream legacy
 * assumption found while tracing GET /api/control/plan one level past
 * the gate (getManagerScope, club-plan.ts, had no grant fallback at all,
 * unlike resolveScopedClubId which already did).
 *
 * Neither requireClubManagerAccess (authz.ts) nor resolveScopedClubId/
 * getManagerScope (club-plan.ts) can be unit-tested directly — all three
 * live in "server-only" files and call getActorContext()/prisma (DB).
 * The composed functions below are NOT a re-implementation competing
 * with any of them — they mirror each one's exact boolean decision,
 * built ONLY from already-pure, already-real-tested primitives
 * (hasActiveRole / anyGrantCoversClub, scope-core.ts), so what's actually
 * exercised here is real product logic, not a parallel guess at it.
 */

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "g1", role: "CLUB_MANAGER", scopeType: "CLUB", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}

/** Mirrors requireClubManagerAccess's exact composed decision (authz.ts):
 * `user.role === "CLUB_MANAGER" || user.role === "ADMIN"` OR an active
 * CLUB_MANAGER RoleAssignment grant (hasActiveRole, already real-tested
 * elsewhere — rbac.test.ts's SCOPE-* — reused here, not re-implemented). */
function clubManagerAccessGranted(appRole: AppRole, grants: RoleGrant[]): boolean {
  if (appRole === "CLUB_MANAGER" || appRole === "ADMIN") return true;
  return hasActiveRole(grants, "CLUB_MANAGER");
}

/**
 * Mirrors resolveScopedClubId's own grant-check branch exactly
 * (club-plan.ts: `actor.grants.some(g => g.role === "CLUB_MANAGER" &&
 * g.status === "ACTIVE" && g.clubId === requestedClubId)`) — for a
 * CLUB_MANAGER grant (always CLUB-scoped by construction, isValidGrantShape
 * in authorize-core.ts), anyGrantCoversClub's own CLUB branch
 * (`grant.clubId === targetClubId`) computes the identical boolean.
 * getManagerScope's new R4 bridge uses the exact same check, so this one
 * composed function covers both call sites' scope decision.
 */
function scopedClubAllowed(grants: RoleGrant[], requestedClubId: string): boolean {
  return anyGrantCoversClub(grants, "CLUB_MANAGER", requestedClubId, null);
}

/* ===================================================================== *
 *  Role admission matrix (section 3 / 13 of the brief)
 * ===================================================================== */

test("CMACCESS-A: legacy AppRole=CLUB_MANAGER is admitted — no grant needed, unchanged from before this round", () => {
  assert.equal(clubManagerAccessGranted("CLUB_MANAGER", []), true);
});

test("CMACCESS-B: THE F-05 FIX — an active CLUB_MANAGER RoleAssignment grant is admitted even with legacy AppRole=EMPLOYEE, the exact case that 403'd on Plan/Templates before this round while already working on Team", () => {
  assert.equal(clubManagerAccessGranted("EMPLOYEE", [grant({ clubId: "club-A" })]), true);
});

test("CMACCESS-C: a plain EMPLOYEE with no grant at all is denied", () => {
  assert.equal(clubManagerAccessGranted("EMPLOYEE", []), false);
});

test("CMACCESS-D: a CITY_MANAGER-only grant (no separate CLUB_MANAGER grant) is denied as CLUB_MANAGER — a CITY_MANAGER must NOT automatically become a desktop CLUB_MANAGER", () => {
  const grants = [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null })];
  assert.equal(clubManagerAccessGranted("EMPLOYEE", grants), false);
});

test("CMACCESS-E: an OPERATIONS_DIRECTOR-only grant is denied as CLUB_MANAGER", () => {
  const grants = [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", clubId: null })];
  assert.equal(clubManagerAccessGranted("EMPLOYEE", grants), false);
});

test("CMACCESS-F: a PROJECT_ADMIN grant alone is denied as CLUB_MANAGER — requireClubManagerAccess's existing semantics are preserved exactly, never widened by this round", () => {
  const grants = [grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", clubId: null })];
  assert.equal(clubManagerAccessGranted("EMPLOYEE", grants), false);
});

test("CMACCESS-G: legacy AppRole=SPM alone is denied", () => {
  assert.equal(clubManagerAccessGranted("SPM", []), false);
});

test("CMACCESS-H: legacy AppRole=ADMIN is admitted, current behavior preserved exactly", () => {
  assert.equal(clubManagerAccessGranted("ADMIN", []), true);
});

test("CMACCESS-I: a SUSPENDED CLUB_MANAGER grant does not admit — only ACTIVE grants are exercisable", () => {
  assert.equal(clubManagerAccessGranted("EMPLOYEE", [grant({ clubId: "club-A", status: "SUSPENDED" })]), false);
});

test("CMACCESS-J: a legacy MANAGER-role employee with no CLUB_MANAGER grant is denied", () => {
  assert.equal(clubManagerAccessGranted("EMPLOYEE", [grant({ role: "MANAGER", clubId: "club-1" })]), false);
});

test("CMACCESS-K: CITY_MANAGER + a SEPARATE active CLUB_MANAGER grant is admitted through the grant — the two axes are independent, holding one does not block the other", () => {
  const grants = [
    grant({ id: "g1", role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }),
    grant({ id: "g2", role: "CLUB_MANAGER", clubId: "club-A" }),
  ];
  assert.equal(clubManagerAccessGranted("EMPLOYEE", grants), true);
});

/* ===================================================================== *
 *  Dashboard visibility (R4.1, sections 1-4/8) — "План дня"/"Команда" cards
 * ===================================================================== */
/**
 * Mirrors ControlDashboard's own "plan"/"team" card visibility exactly
 * (ControlDashboard.tsx: `canManageClub(c.role) || c.isClubManager`) —
 * reuses the SAME server-derived boolean the portal's outer gate and
 * sidebar nav already use (hasActiveRole(actor.grants, "CLUB_MANAGER"),
 * computed in control/(portal)/page.tsx), never a new RBAC check.
 */
function dashboardCardVisible(role: AppRole, isClubManager: boolean): boolean {
  return canManageClub(role) || isClubManager;
}

test("CMDASH-A: legacy CLUB_MANAGER sees the Plan + Team dashboard cards (unchanged)", () => {
  assert.equal(dashboardCardVisible("CLUB_MANAGER", false), true);
});

test("CMDASH-B: THE R4.1 FIX — a RoleAssignment-only CLUB_MANAGER (legacy role EMPLOYEE, isClubManager=true) now sees the Plan + Team dashboard cards, matching the sidebar nav and portal gate that already admitted them", () => {
  assert.equal(dashboardCardVisible("EMPLOYEE", true), true);
});

test("CMDASH-C: a CITY_MANAGER with NO CLUB_MANAGER grant does NOT see the cards merely because CITY_MANAGER can read clubs", () => {
  assert.equal(dashboardCardVisible("EMPLOYEE", false), false);
});

test("CMDASH-D: CITY_MANAGER + a separate active CLUB_MANAGER grant sees the cards, through the grant", () => {
  assert.equal(dashboardCardVisible("EMPLOYEE", true), true);
});

test("CMDASH-E: a plain MANAGER (no CLUB_MANAGER grant) does not see the cards", () => {
  assert.equal(dashboardCardVisible("EMPLOYEE", false), false);
});

test("CMDASH-F: SPM does not see the cards", () => {
  assert.equal(dashboardCardVisible("SPM", false), false);
});

test("CMDASH-G: legacy ADMIN sees the cards — current behavior preserved exactly", () => {
  assert.equal(dashboardCardVisible("ADMIN", false), true);
});

test("CMDASH-WIRE-A (updated for QA-05.1 — Home's navigation cards were removed; the club destinations now live only in the Control nav): the club group (Управляющий / План дня) is shown on canManageClub(role) || isClubManager — never canManageClub(role) alone", () => {
  const src = read("src/lib/control/control-nav.ts");
  assert.match(src, /const managesClub = canManageClub\(flags\.role\) \|\| flags\.isClubManager;/);
  assert.match(src, /if \(managesClub\) \{/);
  assert.doesNotMatch(read("src/components/control/ControlDashboard.tsx"), /key: "plan"|key: "team"/);
});

test("CMDASH-WIRE-B: control/(portal)/page.tsx computes isClubManager via hasActiveRole(actor.grants, \"CLUB_MANAGER\") — reusing the existing primitive, never a new RBAC check — and passes it to ControlDashboard", () => {
  const src = read("src/app/control/(portal)/page.tsx");
  assert.match(src, /const isClubManager = hasActiveRole\(actor\.grants, "CLUB_MANAGER"\);/);
  assert.match(src, /isClubManager=\{isClubManager\}/);
});

/* ===================================================================== *
 *  Scope matrix (section 6 / 7 / 14 of the brief)
 * ===================================================================== */

test("CMSCOPE-A: CLUB_MANAGER grant for Club A — requesting Club A is allowed", () => {
  assert.equal(scopedClubAllowed([grant({ clubId: "club-A" })], "club-A"), true);
});

test("CMSCOPE-B: the SAME actor requesting Club B is denied — a grant for A never widens to B", () => {
  assert.equal(scopedClubAllowed([grant({ clubId: "club-A" })], "club-B"), false);
});

test("CMSCOPE-C: two separate active CLUB_MANAGER grants (A and B) — both A and B are allowed, matching resolveScopedClubId's own documented 'explicit clubId required, independently re-verified against a real grant' behavior — not a new multi-club switcher", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(scopedClubAllowed(grants, "club-A"), true);
  assert.equal(scopedClubAllowed(grants, "club-B"), true);
});

test("CMSCOPE-D: THE CRITICAL DISTINCTION — a CITY_MANAGER grant covering Club A's city does NOT satisfy the CLUB_MANAGER scope check. Generic CITY_MANAGER club.read authority must never widen CLUB_MANAGER Plan/Templates scope; this round fixes ROLE admission, not scope escalation", () => {
  const grants = [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null })];
  assert.equal(scopedClubAllowed(grants, "club-A"), false);
});

test("CMSCOPE-E: CITY_MANAGER(scope covering A+B) + a CLUB_MANAGER grant for A ONLY — A allowed, B denied unless a separate CLUB_MANAGER grant legitimately covers B", () => {
  const grants = [
    grant({ id: "g1", role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }),
    grant({ id: "g2", role: "CLUB_MANAGER", clubId: "club-A" }),
  ];
  assert.equal(scopedClubAllowed(grants, "club-A"), true);
  assert.equal(scopedClubAllowed(grants, "club-B"), false);
});

test("CMSCOPE-F: a SUSPENDED CLUB_MANAGER grant for Club A does not satisfy the scope check", () => {
  assert.equal(scopedClubAllowed([grant({ clubId: "club-A", status: "SUSPENDED" })], "club-A"), false);
});

/* ===================================================================== *
 *  getManagerScope's multi-grant decision (R4.1, sections 5/6/7/9)
 * ===================================================================== */
/**
 * Mirrors getManagerScope's own decision tree for the grant-only branch
 * (no legacy EmployeeProfile.clubId) exactly: filter to ACTIVE CLUB_MANAGER
 * grants; an explicit requestedClubId is honored only if one of those
 * grants covers it; with NO requestedClubId, default to the single grant's
 * club ONLY when there is exactly one — never "first of several". Built
 * from constructed grant arrays, not a re-implementation of the
 * DB-touching function itself (which needs getActorContext()/prisma).
 */
function managerScopeClubId(grants: RoleGrant[], requestedClubId: string | null): string | null {
  const active = grants.filter((g) => g.role === "CLUB_MANAGER" && g.status === "ACTIVE");
  if (requestedClubId) {
    return active.some((g) => g.clubId === requestedClubId) ? requestedClubId : null;
  }
  if (active.length === 1 && active[0].clubId) return active[0].clubId;
  return null;
}

test("CMMULTI-A: THE R4.1 FIX — a single active CLUB_MANAGER grant for Club A, no explicit clubId — resolves to Club A automatically (deterministic: there is only one grant to choose)", () => {
  assert.equal(managerScopeClubId([grant({ clubId: "club-A" })], null), "club-A");
});

test("CMMULTI-B: single grant A, explicit clubId=A — resolves to A (unchanged, consistent with the no-clubId default)", () => {
  assert.equal(managerScopeClubId([grant({ clubId: "club-A" })], "club-A"), "club-A");
});

test("CMMULTI-C: single grant A, explicit clubId=B (foreign) — denied (null), the single-grant default never overrides an explicit, non-matching request", () => {
  assert.equal(managerScopeClubId([grant({ clubId: "club-A" })], "club-B"), null);
});

test("CMMULTI-D: THE REPORTED GAP — two active grants (A+B), no explicit clubId — resolves to null (no club), exactly R4's pre-existing behavior, deliberately UNCHANGED: ambiguous choices are never guessed, per section 6's 'report, do not invent' instruction", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(managerScopeClubId(grants, null), null);
});

test("CMMULTI-E: two active grants (A+B), explicit clubId=A — resolves to A", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(managerScopeClubId(grants, "club-A"), "club-A");
});

test("CMMULTI-F: two active grants (A+B), explicit clubId=B — resolves to B", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(managerScopeClubId(grants, "club-B"), "club-B");
});

test("CMMULTI-G: two active grants (A+B), explicit clubId=C (foreign) — denied (null)", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(managerScopeClubId(grants, "club-C"), null);
});

test("CMMULTI-H: one ACTIVE grant (A) + one SUSPENDED grant (B), no explicit clubId — still resolves to A automatically: the suspended grant never counts toward 'how many active grants exist'", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B", status: "SUSPENDED" })];
  assert.equal(managerScopeClubId(grants, null), "club-A");
});

/* ===================================================================== *
 *  resolveScopedClubId's FULL decision tree (R4.2, sections 2/5/6/7/12)
 * ===================================================================== */
/**
 * Sprint: REMEDIATION R4.3 — this is now a REAL (not mirrored) composition:
 * both calls are the exact two shared pure functions resolveScopedClubId/
 * getManagerScope/resolveClubManagerClubs all call (scope-core.ts), imported
 * directly rather than re-implemented. `ownClubId` maps to a legacy
 * AppRole=CLUB_MANAGER identity (the only legacyRole resolveManagerEligibleClubIds
 * ever consults) — passing "EMPLOYEE" when there is no legacy club keeps every
 * existing grant-only call site below unchanged. Sprint: REMEDIATION R4.3 —
 * replaces the PRE-R4.3 "if (ownClubId) return ownClubId" short-circuit this
 * function used to encode: that modeled the exact bug this round closes (a
 * legacy club made a separate, legitimate CLUB_MANAGER grant unreachable).
 * Legacy and grant identity are now UNIONED into one eligible set first; the
 * resolver only ever auto-picks when that set has exactly one member.
 */
function resolveScopedClubIdFor(ownClubId: string | null, grants: RoleGrant[], requestedClubId: string | null): string | null {
  const eligible = resolveManagerEligibleClubIds(ownClubId ? "CLUB_MANAGER" : "EMPLOYEE", ownClubId, grants);
  return resolveManagerRequestedClub(eligible, requestedClubId);
}

test("CMRESOLVE-A: legacy own club A, no requested club — resolves to A", () => {
  assert.equal(resolveScopedClubIdFor("club-A", [], null), "club-A");
});

test("CMRESOLVE-B: THE R4.2 FIX — a single active CLUB_MANAGER grant (no legacy club), no requested club — resolves to that grant's club automatically, consistent with getManagerScope (CMMULTI-A)", () => {
  assert.equal(resolveScopedClubIdFor(null, [grant({ clubId: "club-A" })], null), "club-A");
});

test("CMRESOLVE-C: multiple active grants (A+B), no requested club — unresolved (null), never an arbitrary 'first grant wins' guess", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor(null, grants, null), null);
});

test("CMRESOLVE-D: multiple active grants (A+B), requested A — resolves to A", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor(null, grants, "club-A"), "club-A");
});

test("CMRESOLVE-E: multiple active grants (A+B), requested B — resolves to B", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor(null, grants, "club-B"), "club-B");
});

test("CMRESOLVE-F: multiple active grants (A+B), requested foreign C — denied (null)", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor(null, grants, "club-C"), null);
});

test("CMRESOLVE-G: THE R4.3 FIX — a real user with a legacy own club A AND a separate active CLUB_MANAGER grant for a DIFFERENT club B now has BOTH in the eligible set: no explicit request is ambiguous (null — selection required), while an explicit request for EITHER A or B legitimately resolves, and a foreign C is still denied. Before R4.3, the legacy club won unconditionally and B was permanently unreachable through this function — the exact mixed-identity gap R4.2 reported and this round closes", () => {
  const grants = [grant({ clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor("club-A", grants, null), null);
  assert.equal(resolveScopedClubIdFor("club-A", grants, "club-A"), "club-A");
  assert.equal(resolveScopedClubIdFor("club-A", grants, "club-B"), "club-B");
  assert.equal(resolveScopedClubIdFor("club-A", grants, "club-C"), null);
});

test("CMRESOLVE-G2: legacy own club A AND a CLUB_MANAGER grant for the SAME club A — deduplicated to one unique eligible club, so it still auto-resolves with no explicit request (never mistaken for the 2+-eligible ambiguous case just because the identity came from two axes)", () => {
  const grants = [grant({ clubId: "club-A" })];
  assert.equal(resolveScopedClubIdFor("club-A", grants, null), "club-A");
});

test("CMRESOLVE-H: CITY_MANAGER(A+B) with NO CLUB_MANAGER grant — not sufficient, no club resolved even with an explicit request", () => {
  const grants = [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null })];
  assert.equal(resolveScopedClubIdFor(null, grants, null), null);
  assert.equal(resolveScopedClubIdFor(null, grants, "club-A"), null);
});

test("CMRESOLVE-I: PROJECT_ADMIN grant alone — not sufficient; resolveScopedClubId's grant bridge is keyed to role===\"CLUB_MANAGER\" specifically, so a PROJECT_ADMIN/SYSTEM grant is never a path to a club through this function, preserving the existing (pre-R4.2) intended result", () => {
  const grants = [grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", clubId: null })];
  assert.equal(resolveScopedClubIdFor(null, grants, null), null);
});

test("CMRESOLVE-J: OPERATIONS_DIRECTOR grant alone — denied as CLUB_MANAGER, same reasoning as CMRESOLVE-I", () => {
  const grants = [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", clubId: null })];
  assert.equal(resolveScopedClubIdFor(null, grants, null), null);
});

test("CMRESOLVE-K: ADMIN's own switching semantics are untouched — resolveScopedClubId's `honored` branch (requestedClubForRole, club-scope.ts) still runs FIRST and returns before any manager eligible-club computation happens at all. Sprint: REMEDIATION R4.3 — the SEPARATE 'legacy own club short-circuits before any grant is consulted' branch this test previously asserted is gone: legacy and grant identity are now unioned by resolveManagerEligibleClubIds for every non-admin actor, closing the mixed-identity gap R4.2 reported", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("async function resolveScopedClubId");
  const fnEnd = src.indexOf("\n/** Clubs an ADMIN", fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  const honoredIdx = fnSrc.indexOf("requestedClubForRole(user.role, requestedClubId)");
  const eligibleIdx = fnSrc.indexOf("resolveManagerEligibleClubIds(user.role, user.employeeProfile?.clubId, actor.grants)");
  assert.ok(honoredIdx > 0 && eligibleIdx > honoredIdx, "order must stay: ADMIN honored branch first, then the shared eligible-club computation");
  assert.doesNotMatch(fnSrc, /const own = user\.employeeProfile\?\.clubId/, "the old standalone legacy-only short-circuit must be gone, not layered alongside the union");
});

/* ===================================================================== *
 *  Eligible-club-set matrix (R4.3, brief section 11) — resolveManagerEligibleClubIds
 *  is pure and lives in scope-core.ts (no "server-only"), so it is imported
 *  and exercised DIRECTLY here — real tests, not a mirror, not a
 *  source-regex-only proof.
 * ===================================================================== */

test("CMELIGIBLE-A: legacy AppRole=CLUB_MANAGER with EmployeeProfile.clubId=A, no grants — eligible set is [A]", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("CLUB_MANAGER", "club-A", []), ["club-A"]);
});

test("CMELIGIBLE-B: no legacy club, one active CLUB_MANAGER grant for A — eligible set is [A]", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, [grant({ clubId: "club-A" })]), ["club-A"]);
});

test("CMELIGIBLE-C: no legacy club, two active CLUB_MANAGER grants (A+B) — eligible set is [A, B]", () => {
  const grants = [grant({ id: "g1", clubId: "club-A" }), grant({ id: "g2", clubId: "club-B" })];
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, grants), ["club-A", "club-B"]);
});

test("CMELIGIBLE-D: THE R4.3 FIX — legacy club A UNION a separate active CLUB_MANAGER grant for B — eligible set is [A, B], neither axis shadows the other", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("CLUB_MANAGER", "club-A", [grant({ clubId: "club-B" })]), ["club-A", "club-B"]);
});

test("CMELIGIBLE-E: legacy club A UNION a CLUB_MANAGER grant for the SAME club A — deduplicated to one unique eligible club [A], not [A, A]", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("CLUB_MANAGER", "club-A", [grant({ clubId: "club-A" })]), ["club-A"]);
});

test("CMELIGIBLE-F: a CITY_MANAGER grant (covering cities/clubs A+B via CITY scope) contributes NOTHING to the CLUB_MANAGER eligible set — CITY_MANAGER authority never adds manager clubs on its own", () => {
  const grants = [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null })];
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, grants), []);
});

test("CMELIGIBLE-G: OPERATIONS_DIRECTOR/PROJECT_ADMIN grants contribute nothing to the eligible set either — only an active CLUB_MANAGER identity (legacy role or grant) ever does", () => {
  const grants = [
    grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", clubId: null }),
    grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM", clubId: null }),
  ];
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, grants), []);
});

test("CMELIGIBLE-H: a CITY_MANAGER(A+B) actor who ALSO separately holds an active CLUB_MANAGER grant for A — eligible set is [A] only, never widened to B just because the same actor can read B as CITY_MANAGER", () => {
  const grants = [
    grant({ id: "g1", role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh", clubId: null }),
    grant({ id: "g2", role: "CLUB_MANAGER", clubId: "club-A" }),
  ];
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, grants), ["club-A"]);
});

test("CMELIGIBLE-I: a SUSPENDED CLUB_MANAGER grant never contributes — only ACTIVE grants count toward eligibility", () => {
  const grants = [grant({ clubId: "club-A", status: "SUSPENDED" })];
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, grants), []);
});

test("CMELIGIBLE-J: no legacy club, no grants at all — eligible set is empty, never a crash/undefined", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("EMPLOYEE", null, []), []);
});

test("CMELIGIBLE-K: legacyRole=CLUB_MANAGER but legacyClubId is null (no EmployeeProfile) — the legacy axis contributes nothing on its own; a separate grant still can", () => {
  assert.deepEqual(resolveManagerEligibleClubIds("CLUB_MANAGER", null, []), []);
  assert.deepEqual(resolveManagerEligibleClubIds("CLUB_MANAGER", null, [grant({ clubId: "club-A" })]), ["club-A"]);
});

/* ===================================================================== *
 *  Scope-decision matrix (R4.3, brief section 12) — resolveManagerRequestedClub
 *  is pure (scope-core.ts), imported and exercised DIRECTLY — real tests.
 * ===================================================================== */

test("CMREQCLUB-A: THE single-eligible-club default — eligible=[A], no request — auto-resolves to A. This is the exact guard CMWIRE-F/CMWIRE-G reference as 'real, non-structural coverage'", () => {
  assert.equal(resolveManagerRequestedClub(["club-A"], null), "club-A");
});

test("CMREQCLUB-B: eligible=[A, B], no request — selection required (null), never an arbitrary 'first eligible wins' guess", () => {
  assert.equal(resolveManagerRequestedClub(["club-A", "club-B"], null), null);
});

test("CMREQCLUB-C: eligible=[A, B], requested=A — resolves to A", () => {
  assert.equal(resolveManagerRequestedClub(["club-A", "club-B"], "club-A"), "club-A");
});

test("CMREQCLUB-D: eligible=[A, B], requested=B — resolves to B", () => {
  assert.equal(resolveManagerRequestedClub(["club-A", "club-B"], "club-B"), "club-B");
});

test("CMREQCLUB-E: eligible=[A, B], requested=C (outside the set) — denied (null), per 'requested-inside-set -> allowed; requested-outside-set -> denied'", () => {
  assert.equal(resolveManagerRequestedClub(["club-A", "club-B"], "club-C"), null);
});

test("CMREQCLUB-F: eligible=[] (no scope at all), no request — null, the honest 'no club' case", () => {
  assert.equal(resolveManagerRequestedClub([], null), null);
});

test("CMREQCLUB-G: eligible=[] and an explicit request anyway — still denied (null); an empty eligible set can never be talked into a club by a client-supplied id", () => {
  assert.equal(resolveManagerRequestedClub([], "club-A"), null);
});

test("CMREQCLUB-H: eligible=[A] (exactly one legitimate club) but the explicit request is a DIFFERENT, foreign club B — denied (null), NOT silently redirected to the one real option. An explicit wrong request must fail honestly, never fall back to a default the caller didn't ask for", () => {
  assert.equal(resolveManagerRequestedClub(["club-A"], "club-B"), null);
});

/* ===================================================================== *
 *  /control/plan's UI scope decision (R4.2, section 13) — real, pure,
 *  imported directly (control-plan-ui.ts has no "server-only"/DOM import)
 * ===================================================================== */

test("CMUI-A: 0 eligible manager clubs (non-admin, managedClubsCount=0) — no-club state", () => {
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: false, managedClubsCount: 0 }), "no-club");
});

test("CMUI-B: a resolved clubId is ALWAYS active, regardless of admin/manager or managedClubsCount — the single eligible-club case included (the server already auto-resolved it; no picker needed)", () => {
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: "club-A", isAdmin: false, managedClubsCount: 1 }), "active");
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: "club-A", isAdmin: true, managedClubsCount: null }), "active");
});

test("CMUI-C: 2+ eligible manager clubs, no resolved clubId — selection required (manager-select-club)", () => {
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: false, managedClubsCount: 2 }), "manager-select-club");
});

test("CMUI-D: non-admin, no resolved clubId, managedClubsCount not yet known (null) — loading, never misreported as 'no club'", () => {
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: false, managedClubsCount: null }), "loading-manager-clubs");
});

test("CMUI-E: ADMIN, no resolved clubId — admin-select-club, regardless of managedClubsCount (irrelevant for admin)", () => {
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: true, managedClubsCount: null }), "admin-select-club");
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: true, managedClubsCount: 5 }), "admin-select-club");
});

test("CMUI-F: a selected/requested club that the server rejected (resolvedClubId stays null) re-enters the SAME selection state it started from — 'rejected/reset', never a crash or a stuck empty-looking plan. Composing this exactly as the page does: a stale/foreign selection simply never becomes resolvedClubId, so the decision is identical to CMUI-C/CMUI-A", () => {
  // Multi-grant manager picks a stale/foreign club -> server denies -> resolvedClubId stays null -> re-prompt.
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: false, managedClubsCount: 2 }), "manager-select-club");
  // Single-eligible-club manager's one option becomes invalid (e.g. revoked mid-session) -> 0 eligible now -> no-club.
  assert.equal(resolvePlanScopeUiState({ resolvedClubId: null, isAdmin: false, managedClubsCount: 0 }), "no-club");
});

/* ===================================================================== *
 *  Route wiring — structural, additional proof only (section 15)
 * ===================================================================== */

const SIX_ROUTES = [
  "src/app/api/control/plan/route.ts",
  "src/app/api/control/plan/tasks/route.ts",
  "src/app/api/control/plan/tasks/[id]/route.ts",
  "src/app/api/control/templates/route.ts",
  "src/app/api/control/templates/[id]/route.ts",
  "src/app/api/control/templates/reorder/route.ts",
];

test("CMWIRE-A: every one of the six affected routes imports and calls requireClubManagerAccess", () => {
  for (const file of SIX_ROUTES) {
    const src = read(file);
    assert.match(src, /import \{ requireClubManagerAccess \} from "@\/lib\/server\/authz";/, `${file} should import requireClubManagerAccess`);
    assert.match(src, /await requireClubManagerAccess\(\)/, `${file} should call requireClubManagerAccess()`);
  }
});

test("CMWIRE-B: none of the six affected routes still CALL the legacy-only requireClubManager() (mentions in explanatory doc comments about the fix are expected and fine — this checks the actual call site)", () => {
  for (const file of SIX_ROUTES) {
    const src = read(file);
    assert.doesNotMatch(src, /[^.]\brequireClubManager\(\)/, `${file} must no longer call the legacy-only gate`);
    assert.doesNotMatch(src, /import \{ requireClubManager \}/, `${file} must no longer import the legacy-only gate`);
  }
});

test("CMWIRE-C: requireClubManager itself still exists in authz.ts (not removed/retired) — this round fixes the six call sites, never requireClubManager's own semantics or its availability for a genuinely legacy-only surface", () => {
  const src = read("src/lib/server/authz.ts");
  assert.match(src, /export const requireClubManager = \(\) => requireRole\("CLUB_MANAGER", "ADMIN"\);/);
});

test("CMWIRE-D: getManagerScope (club-plan.ts) calls the SAME shared eligible-club/requested-club helpers resolveScopedClubId uses (resolveManagerEligibleClubIds/resolveManagerRequestedClub, scope-core.ts) — the downstream legacy assumption fix for GET /api/control/plan, now expressed as one shared function instead of each resolver re-deriving its own copy", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function getManagerScope");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /resolveManagerEligibleClubIds\(user\.role, user\.employeeProfile\?\.clubId, actor\.grants\)/);
  assert.match(fnSrc, /resolveManagerRequestedClub\(eligible, requestedClubId\)/);
});

test("CMWIRE-F: Sprint: REMEDIATION R4.1/R4.3 — the single-eligible-club default (no explicit clubId needed when there is exactly one legitimate club) now lives in resolveManagerRequestedClub (scope-core.ts, pure, shared) rather than duplicated inside getManagerScope/resolveScopedClubId — real, non-structural coverage of the exact guard is CMREQCLUB-A below", () => {
  const src = read("src/lib/server/rbac/scope-core.ts");
  const fnStart = src.indexOf("export function resolveManagerRequestedClub");
  const fnSrc = src.slice(fnStart, fnStart + 400);
  assert.match(fnSrc, /eligibleClubIds\.length === 1/);
});

test("CMWIRE-G: the single-eligible-club default guard is an exact equality (=== 1), never a >= 1 or unconditional 'pick the first club' — the ambiguous 2+-eligible case is never guessed at", () => {
  const src = read("src/lib/server/rbac/scope-core.ts");
  const fnStart = src.indexOf("export function resolveManagerRequestedClub");
  const fnSrc = src.slice(fnStart, fnStart + 400);
  assert.match(fnSrc, /eligibleClubIds\.length === 1/);
  assert.doesNotMatch(fnSrc, /eligibleClubIds\.length (>=|>) /);
});

test("CMWIRE-E: deleteManagerTask's ownership check compares the task owner's employeeProfile.clubId against the resolved club — never actor.role — so the wider role gate cannot turn into cross-club delete access", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function deleteManagerTask");
  const fnEnd = src.indexOf("\n/* ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /task\.user\.employeeProfile\?\.clubId !== clubId/);
  assert.doesNotMatch(fnSrc, /actor\.role|task\.user\.role/);
});

/* ===================================================================== *
 *  R4.2 wiring — resolveScopedClubId parity + /control/plan UI
 * ===================================================================== */

test("CMWIRE-H: resolveScopedClubId's eligible-club computation now runs UNCONDITIONALLY for every non-admin actor (getActorContext + resolveManagerEligibleClubIds, not gated behind any requestedClubId check or a legacy-own-club short-circuit) — the exact change that unions legacy and grant identity instead of letting one win unconditionally", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("async function resolveScopedClubId");
  const fnEnd = src.indexOf("\n/** Clubs an ADMIN", fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  const actorIdx = fnSrc.indexOf("const actor = await getActorContext(user)");
  const eligibleIdx = fnSrc.indexOf("resolveManagerEligibleClubIds(user.role, user.employeeProfile?.clubId, actor.grants)");
  const resolvedIdx = fnSrc.indexOf("resolveManagerRequestedClub(eligible, requestedClubId)");
  assert.ok(actorIdx > 0 && eligibleIdx > actorIdx && resolvedIdx > eligibleIdx, "order must stay: getActorContext -> eligible-club union -> requested-club resolution, all unconditional");
});

test("CMWIRE-I: /control/plan writes are scoped by plan.clubId (the server-RESOLVED club), never a raw selection state — ScopeContext.Provider now receives plan?.clubId, closing the exact gap R4.1 reported (a single-grant manager could read but not write)", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  assert.match(src, /<ScopeContext\.Provider value=\{plan\?\.clubId \?\? null\}>/);
});

test("CMWIRE-J: the plan page fetches the manager's own eligible clubs via cabinetApi.myManagedClubs() — GET /api/control/club/clubs, the SAME existing, server-validated endpoint (resolveClubManagerClubs) — never a new/duplicate 'manager clubs' API", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  assert.match(src, /import \{ cabinetApi \} from "@\/lib\/api\/cabinet-client";/);
  assert.match(src, /cabinetApi\.myManagedClubs\(\)/);
});

test("CMWIRE-K: ClubScopePicker is rendered for a non-admin manager ONLY when there is more than one eligible club (canPickManagerClub requires managedClubs.length > 1) — a single-club manager (legacy or single-grant) never sees an unnecessary picker", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  assert.match(src, /const canPickManagerClub = !isAdmin && managedClubs !== null && managedClubs\.length > 1;/);
});

test("CMWIRE-L: ADMIN's own club picker is untouched in substance — still rendered from scope.clubs (every active club via listActiveClubs), never narrowed to managedClubs/resolveClubManagerClubs", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  const adminPickerIdx = src.indexOf("{isAdmin && scope && (");
  const nextLine = src.slice(adminPickerIdx, src.indexOf("\n", src.indexOf("\n", adminPickerIdx) + 1));
  assert.match(nextLine, /clubs=\{scope\.clubs\}/);
});

test("CMWIRE-M: the main plan body and the empty/selection panel are driven by the SAME uiState value (resolvePlanScopeUiState) — never two independently-computed conditions that could disagree about whether a club is actually resolved", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  assert.match(src, /\{uiState && uiState !== "active" && \(/);
  assert.match(src, /\{uiState === "active" && plan && \(/);
});

test("CMWIRE-N: ClubScopePicker's shared component takes `clubs` directly (not a whole ManagerScopeDTO-shaped `scope` object) — both call sites (control/plan, control/team) pass their own already-server-validated club list", () => {
  const picker = read("src/components/control/ClubScopePicker.tsx");
  assert.match(picker, /clubs: \{ id: string; name: string; cityName: string \| null \}\[\];/);
  const planSrc = read("src/app/control/(portal)/plan/page.tsx");
  const teamSrc = read("src/app/control/(portal)/team/page.tsx");
  assert.doesNotMatch(planSrc, /<ClubScopePicker scope=\{/);
  assert.doesNotMatch(teamSrc, /<ClubScopePicker scope=\{/);
});

/* ===================================================================== *
 *  Full HTTP write-flow matrix (section 14) — the ONE thing the pure/
 *  structural coverage above genuinely cannot reach: real DailyTask/
 *  ClubTaskTemplate rows through a live Postgres connection. Every
 *  decision driving these flows (which club resolves, which requests are
 *  denied) is real-tested above (the CMRESOLVE, CMMULTI, and CMWIRE-E
 *  tests); this names the full end-to-end claim only Postgres + a running
 *  server could additionally prove.
 * ===================================================================== */

test(
  "CMHTTP-A: a single-grant RoleAssignment-only CLUB_MANAGER(A) — GET plan resolves A, POST task/template, PATCH template, POST reorder, and DELETE task all operate on A with no explicit clubId required; a forged clubId=B on any of these six calls is denied",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CMHTTP-B: a multi-grant RoleAssignment-only CLUB_MANAGER(A+B) — with no selected club every one of the six endpoints is unresolved (409/empty); after selecting A, every read/write operates on A; after switching to B, every read/write operates on B; a forged clubId=C is denied regardless of which club was last selected",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

/* ===================================================================== *
 *  R4.3 — /control/team scoped-club parity with /control/plan
 *  (brief sections 6/7/8/14)
 * ===================================================================== */

const readTeamRoute = () => read("src/app/api/control/team/route.ts");
const readTeamPage = () => read("src/app/control/(portal)/team/page.tsx");

test("CMTEAM-WIRE-A: GET /api/control/team's manager branch now admits canManageClub(role) OR an active CLUB_MANAGER grant (hasActiveRole(actor.grants, \"CLUB_MANAGER\")) — THE R4.3 FIX, mirroring requireClubManagerAccess's own admission rule so a RoleAssignment-only CLUB_MANAGER (no legacy AppRole) reaches getClubTeam/getManagerScope instead of falling through to the bare 400 club_required branch", () => {
  const src = readTeamRoute();
  assert.match(src, /canManageClub\(user\.role\) \|\| hasActiveRole\(actor\.grants, "CLUB_MANAGER"\)/);
});

test("CMTEAM-WIRE-B: the actor's grants (getActorContext) are resolved BEFORE the manager-branch check, not only inside the generic club.read fallback — otherwise the widened condition in CMTEAM-WIRE-A would have nothing to read", () => {
  const src = readTeamRoute();
  const actorIdx = src.indexOf("const actor = await getActorContext(user)");
  const gateIdx = src.indexOf('canManageClub(user.role) || hasActiveRole(actor.grants, "CLUB_MANAGER")');
  assert.ok(actorIdx > 0 && gateIdx > actorIdx, "getActorContext must run before the widened manager-branch condition");
});

test("CMTEAM-WIRE-C: the View-As CLUB_MANAGER preview branch (tier 1) still runs BEFORE the widened manager branch (tier 2) — a preview must keep taking priority, exactly as before this round", () => {
  const src = readTeamRoute();
  const viewAsIdx = src.indexOf('viewContext.previewRole === "CLUB_MANAGER"');
  const gateIdx = src.indexOf('canManageClub(user.role) || hasActiveRole(actor.grants, "CLUB_MANAGER")');
  assert.ok(viewAsIdx > 0 && gateIdx > viewAsIdx, "View-As preview branch must stay first");
});

test("CMTEAM-WIRE-D: requireNoManagerPersonaPreview is still called before any branch runs — R2.2's MANAGER-persona confinement is untouched by this round's gate widening", () => {
  const src = readTeamRoute();
  const guardIdx = src.indexOf("await requireNoManagerPersonaPreview(user)");
  const gateIdx = src.indexOf('canManageClub(user.role) || hasActiveRole(actor.grants, "CLUB_MANAGER")');
  assert.ok(guardIdx > 0 && gateIdx > guardIdx);
});

test("CMTEAM-WIRE-E: the team page fetches the manager's own eligible clubs via the SAME cabinetApi.myManagedClubs() endpoint control/plan uses — never a new/duplicate 'manager clubs' API", () => {
  const src = readTeamPage();
  assert.match(src, /import \{ cabinetApi \} from "@\/lib\/api\/cabinet-client";/);
  assert.match(src, /cabinetApi\.myManagedClubs\(\)/);
});

test("CMTEAM-WIRE-F: the team page reuses resolvePlanScopeUiState (control-plan-ui.ts) for its own empty/selection panel — the SAME shared decision control/plan uses, never a second competing state machine", () => {
  const src = readTeamPage();
  assert.match(src, /import \{ resolvePlanScopeUiState \} from "@\/lib\/control-plan-ui";/);
  assert.match(src, /resolvePlanScopeUiState\(\{/);
});

test("CMTEAM-WIRE-G: the team page reuses the shared ClubScopePicker component (clubs=... prop) for both the ADMIN and the multi-club-manager case — never a second, competing picker implementation", () => {
  const src = readTeamPage();
  assert.match(src, /import \{ ClubScopePicker \} from "@\/components\/control\/ClubScopePicker";/);
  const adminPickerIdx = src.indexOf("{isAdmin && scope && (");
  const managerPickerIdx = src.indexOf("{canPickManagerClub && managedClubs && (");
  assert.ok(adminPickerIdx > 0 && managerPickerIdx > adminPickerIdx);
  assert.doesNotMatch(src, /<ClubScopePicker scope=\{/);
});

test("CMTEAM-WIRE-H: the team page's picker-visibility guard is the exact same shape as control/plan's (canPickManagerClub requires managedClubs.length > 1) — a single-club manager, legacy or single-grant, never sees an unnecessary picker on Team either", () => {
  const src = readTeamPage();
  assert.match(src, /const canPickManagerClub = !isAdmin && managedClubs !== null && managedClubs\.length > 1;/);
});

test("CMTEAM-WIRE-I (updated for QA-05.1 — the mutation moved into the shared ClubAccessActionButton): Team mutations (approve/setAccess) are scoped by the server-RESOLVED team.clubId, never the raw selectedClubId", () => {
  const src = readTeamPage();
  assert.match(src, /const scopeClubId = team\?\.clubId \?\? null;/);
  assert.match(src, /<ClubAccessActionButton userId=\{m\.userId\} status=\{m\.accessStatus\} clubId=\{scopeClubId\}/);
  assert.doesNotMatch(src, /clubId=\{selectedClubId\}/);
  const shared = read("src/components/control/ClubAccessAction.tsx");
  assert.match(shared, /\? await managerApi\.approve\(userId, "FULL", clubId\)\s*\n\s*: await managerApi\.setAccess\(userId, action\.target, clubId\);/);
});

test("CMTEAM-WIRE-J: the team page's main table and the empty/selection panel are driven by the SAME uiState value — never two independently-computed conditions that could disagree about whether a club is actually resolved (mirrors CMWIRE-M for Plan)", () => {
  const src = readTeamPage();
  assert.match(src, /\{uiState && uiState !== "active" && \(/);
  assert.match(src, /\{uiState === "active" && team && \(/);
});

test(
  "CMTEAM-HTTP-A: a mixed-identity CLUB_MANAGER — legacy EmployeeProfile.clubId=A AND a separate active CLUB_MANAGER grant for B — sees BOTH A and B via GET /api/control/club/clubs; with no selection GET /api/control/team is unresolved (empty/409-equivalent per getManagerScope); selecting A resolves Team/approve/access to A; selecting B resolves all three to B; a forged clubId=C is denied on every one",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CMTEAM-HTTP-B: a RoleAssignment-only CLUB_MANAGER with a SINGLE grant for A — GET /api/control/team auto-resolves A with no explicit clubId (THE R4.3 FIX — previously 400 club_required), and approve/access on a real employee of A succeed with no explicit clubId either",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
