import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasActiveRole, anyGrantCoversClub } from "../src/lib/server/rbac/scope-core";
import type { RoleGrant } from "../src/lib/server/rbac/types";
import type { AppRole } from "@prisma/client";

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
  assert.match(fnSrc, /g\.role === "CLUB_MANAGER" && g\.status === "ACTIVE" && g\.clubId === requestedClubId/);
});

test("CMWIRE-E: deleteManagerTask's ownership check compares the task owner's employeeProfile.clubId against the resolved club — never actor.role — so the wider role gate cannot turn into cross-club delete access", () => {
  const src = read("src/lib/server/club-plan.ts");
  const fnStart = src.indexOf("export async function deleteManagerTask");
  const fnEnd = src.indexOf("\n/* ", fnStart + 10);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /task\.user\.employeeProfile\?\.clubId !== clubId/);
  assert.doesNotMatch(fnSrc, /actor\.role|task\.user\.role/);
});
