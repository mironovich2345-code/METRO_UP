import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasSharedControlAccess, hasSystemAccess } from "../src/lib/server/rbac/authorize-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";
import { isSharedControlRole } from "../src/lib/roles";

/**
 * Sprint: LIVE QA QA-06.2 — Profile's shared Control entry (/spm) follows the
 * QA-06.1 capability instead of the legacy-role-only canAccessSpm. Profile
 * receives `role` and the server-derived `hasSystemAccess` (meDTO); the entry
 * is isSharedControlRole(role, hasSystemAccess) — the same predicate the
 * server guard uses — so for every actor the entry equals server access.
 */

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const grant = (role: RoleGrant["role"], status: RoleGrant["status"] = "ACTIVE"): RoleGrant => ({
  id: `g-${role}`,
  role,
  scopeType: role === "PROJECT_ADMIN" ? "SYSTEM" : role === "CITY_MANAGER" ? "CITY" : "CLUB",
  cityId: role === "CITY_MANAGER" ? "city-1" : null,
  clubId: role === "CLUB_MANAGER" || role === "MANAGER" ? "club-1" : null,
  status,
});
const actor = (o: Partial<ActorContext>): ActorContext => ({
  userId: "u",
  appRole: "EMPLOYEE",
  accessStatus: "FULL",
  onboardingCompleted: true,
  employeeClubId: null,
  grants: [],
  ...o,
});

/** What Profile computes from the /api/auth/me DTO (role + server hasSystemAccess). */
const profileShowsEntry = (a: ActorContext) => isSharedControlRole(a.appRole, hasSystemAccess(a));

const MATRIX: Array<[string, ActorContext, boolean]> = [
  ["PROJECT_ADMIN grant-only", actor({ grants: [grant("PROJECT_ADMIN")] }), true],
  ["legacy ADMIN", actor({ appRole: "ADMIN" }), true],
  ["legacy SPM", actor({ appRole: "SPM" }), true],
  ["SPM with a club grant", actor({ appRole: "SPM", grants: [grant("CLUB_MANAGER")] }), true],
  ["CLUB_MANAGER role only", actor({ appRole: "CLUB_MANAGER" }), false],
  ["CLUB_MANAGER grant only", actor({ grants: [grant("CLUB_MANAGER")] }), false],
  ["CITY_MANAGER grant only", actor({ grants: [grant("CITY_MANAGER")] }), false],
  ["MANAGER grant only", actor({ grants: [grant("MANAGER")] }), false],
  ["ended PROJECT_ADMIN grant", actor({ grants: [grant("PROJECT_ADMIN", "ENDED")] }), false],
  ["suspended PROJECT_ADMIN grant", actor({ grants: [grant("PROJECT_ADMIN", "SUSPENDED")] }), false],
  ["pending PROJECT_ADMIN grant", actor({ grants: [grant("PROJECT_ADMIN", "PENDING_APPROVAL")] }), false],
  ["plain employee", actor({}), false],
];

test("PROFILE-ENTRY-MATRIX: the shared Control entry is visible exactly for PROJECT_ADMIN / ADMIN / SPM", () => {
  for (const [name, a, expected] of MATRIX) assert.equal(profileShowsEntry(a), expected, name);
});

test("PROFILE-ENTRY-EQUALS-SERVER: for every actor the Profile entry equals the /spm server guard's decision", () => {
  for (const [name, a] of MATRIX) assert.equal(profileShowsEntry(a), hasSharedControlAccess(a), name);
});

test("PROFILE-ENTRY-WIRING: Profile uses isSharedControlRole with the server-derived hasSystemAccess — no canAccessSpm, no new rule", () => {
  const src = code("src/app/profile/page.tsx");
  assert.doesNotMatch(src, /canAccessSpm/);
  assert.match(src, /const isAdmin = serverUser\?\.hasSystemAccess \?\? false;/);
  assert.match(src, /const canSharedControl = serverUser \? isSharedControlRole\(serverUser\.role, isAdmin\) : false;/);
  assert.match(src, /\{canSharedControl && \(/);
});

test("PROFILE-ENTRY-LABEL: neutral label (the Control group name), not «Панель СПМ»; destination unchanged", () => {
  const src = code("src/app/profile/page.tsx");
  assert.doesNotMatch(src, /Панель СПМ/);
  const block = src.slice(src.indexOf("{canSharedControl && ("));
  assert.match(block.slice(0, 1200), /Контроль и результаты/);
  assert.match(block.slice(0, 1200), /router\.push\("\/spm"\)/);
});
