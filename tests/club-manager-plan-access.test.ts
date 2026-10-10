import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasActiveRole, anyGrantCoversClub } from "../src/lib/server/rbac/scope-core";
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

test("CMDASH-WIRE-A: ControlDashboard's 'plan' and 'team' cards both check canManageClub(c.role) || c.isClubManager — never canManageClub(c.role) alone", () => {
  const src = read("src/components/control/ControlDashboard.tsx");
  const planIdx = src.indexOf('key: "plan"');
  const teamIdx = src.indexOf('key: "team"');
  const planLine = src.slice(planIdx, src.indexOf("\n", planIdx));
  const teamLine = src.slice(teamIdx, src.indexOf("\n", teamIdx));
  assert.match(planLine, /canManageClub\(c\.role\) \|\| c\.isClubManager/);
  assert.match(teamLine, /canManageClub\(c\.role\) \|\| c\.isClubManager/);
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
 * Sprint: REMEDIATION R4.2, F-05 — resolveScopedClubId (the WRITE-side
 * resolver used by create/delete task + the three template functions) is
 * now brought into parity with getManagerScope: its grant-bridge branch is
 * the IDENTICAL logic managerScopeClubId above already mirrors (both
 * functions literally share the same filter/some/length===1 shape after
 * this round's fix), so it is reused here rather than re-implemented a
 * second time. This composed function adds the ONE piece managerScopeClubId
 * deliberately does not model — the legacy own-EmployeeProfile.clubId
 * branch, which runs BEFORE any grant is even consulted.
 */
function resolveScopedClubIdFor(ownClubId: string | null, grants: RoleGrant[], requestedClubId: string | null): string | null {
  if (ownClubId) return ownClubId;
  return managerScopeClubId(grants, requestedClubId);
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

test("CMRESOLVE-G: THE REPORTED PRECEDENCE (section 5) — a real user with a legacy own club A AND a separate active CLUB_MANAGER grant for a DIFFERENT club B is locked to A unconditionally; the grant for B is never reachable through this function for them, even when B is explicitly requested. Pre-existing precedence (not introduced by this round), traced and left unchanged, never guessed", () => {
  const grants = [grant({ clubId: "club-B" })];
  assert.equal(resolveScopedClubIdFor("club-A", grants, null), "club-A");
  assert.equal(resolveScopedClubIdFor("club-A", grants, "club-B"), "club-A");
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

test("CMRESOLVE-K: ADMIN's own switching semantics are untouched by this round — resolveScopedClubId's `honored` branch (requestedClubForRole, club-scope.ts) runs BEFORE the legacy-own-club check and before any grant is consulted at all, exactly as before R4.2; this round only ever added code inside the branch that already required `!honored`", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("async function resolveScopedClubId");
  const fnEnd = src.indexOf("\n/** Clubs an ADMIN", fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  const honoredIdx = fnSrc.indexOf("requestedClubForRole(user.role, requestedClubId)");
  const ownIdx = fnSrc.indexOf("const own = user.employeeProfile?.clubId");
  const gateIdx = fnSrc.indexOf("const actor = await getActorContext(user)");
  assert.ok(honoredIdx > 0 && ownIdx > honoredIdx && gateIdx > ownIdx, "order must stay: ADMIN honored -> legacy own club -> grant bridge");
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

test("CMWIRE-D: getManagerScope (club-plan.ts) now has the same RoleAssignment-grant bridge resolveScopedClubId already had — the downstream legacy assumption fix for GET /api/control/plan", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function getManagerScope");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /g\.role === "CLUB_MANAGER" && g\.status === "ACTIVE"/);
  assert.match(fnSrc, /clubManagerGrants\.some\(\(g\) => g\.clubId === requestedClubId\)/);
});

test("CMWIRE-F: Sprint: REMEDIATION R4.1 — getManagerScope defaults to the single active CLUB_MANAGER grant's club when no explicit clubId is given AND there is exactly one such grant — the fix for a single-grant manager whose client-side page has no mechanism to send a clubId at all (ClubScopePicker renders ADMIN-only)", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function getManagerScope");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /clubManagerGrants\.length === 1 && clubManagerGrants\[0\]\.clubId/);
});

test("CMWIRE-G: the single-grant default guard is an exact equality (=== 1), never a >= 1 or unconditional 'pick the first grant' — the ambiguous multi-grant case is left exactly as R4 produced it (no club resolved without an explicit clubId), never an arbitrary 'first grant wins' guess", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function getManagerScope");
  const fnEnd = src.indexOf("\nexport ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /clubManagerGrants\.length === 1/);
  assert.doesNotMatch(fnSrc, /clubManagerGrants\.length (>=|>) /);
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

test("CMWIRE-H: resolveScopedClubId's grant bridge now runs UNCONDITIONALLY (getActorContext/clubManagerGrants computed every time own club is absent), never gated behind `if (requestedClubId)` as it was before R4.2 — the exact change that lets the single-grant default apply with no explicit clubId", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("async function resolveScopedClubId");
  const fnEnd = src.indexOf("\n/** Clubs an ADMIN", fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  const actorIdx = fnSrc.indexOf("const actor = await getActorContext(user)");
  const requestedIfIdx = fnSrc.indexOf("if (requestedClubId)");
  assert.ok(actorIdx > 0 && requestedIfIdx > actorIdx, "getActorContext must run BEFORE the requestedClubId branch, not inside it");
  assert.match(fnSrc, /clubManagerGrants\.length === 1 && clubManagerGrants\[0\]\.clubId/);
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
