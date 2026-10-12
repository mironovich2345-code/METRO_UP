import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hasSharedControlAccess, hasSystemAccess } from "../src/lib/server/rbac/authorize-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";
import { isSharedControlRole } from "../src/lib/roles";
import { buildControlNav, flattenControlNav, type ControlNavFlags } from "../src/lib/control/control-nav";

/**
 * Sprint: LIVE QA QA-06.1 — PROJECT_ADMIN and SPM share Обучение, Скрипты,
 * Инструкции, Тайный покупатель, Продажи, Рейтинг сотрудников. Метрик, Роли,
 * Сотрудники and Логи stay PROJECT_ADMIN-only. One capability
 * (hasSharedControlAccess / requireSharedControlAccess) decides the shared
 * surfaces on the server, and the navigation uses the same predicate.
 */

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routes(p));
    else if (name === "route.ts") out.push(p);
  }
  return out.sort();
}

const grant = (role: RoleGrant["role"], status: RoleGrant["status"] = "ACTIVE"): RoleGrant => ({
  id: `g-${role}`,
  role,
  scopeType: role === "PROJECT_ADMIN" ? "SYSTEM" : role === "CITY_MANAGER" ? "CITY" : role === "OPERATIONS_DIRECTOR" ? "NETWORK" : "CLUB",
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

const GRANT_PROJECT_ADMIN = actor({ grants: [grant("PROJECT_ADMIN")] });
const LEGACY_ADMIN = actor({ appRole: "ADMIN" });
const LEGACY_SPM = actor({ appRole: "SPM" });
const CLUB_MANAGER_ROLE = actor({ appRole: "CLUB_MANAGER" });
const CLUB_MANAGER_GRANT = actor({ grants: [grant("CLUB_MANAGER")] });
const CITY_MANAGER_GRANT = actor({ grants: [grant("CITY_MANAGER")] });
const OD_GRANT = actor({ grants: [grant("OPERATIONS_DIRECTOR")] });
const MANAGER_GRANT = actor({ grants: [grant("MANAGER")] });

/* ===================================================================== *
 *  Capability matrix (pure)
 * ===================================================================== */

test("CAP-PA: a PROJECT_ADMIN by grant only has the shared capability and system access", () => {
  assert.equal(hasSharedControlAccess(GRANT_PROJECT_ADMIN), true);
  assert.equal(hasSystemAccess(GRANT_PROJECT_ADMIN), true);
});

test("CAP-SPM: SPM has the shared capability but NOT system access (Метрик / Роли / Сотрудники / Логи stay closed)", () => {
  assert.equal(hasSharedControlAccess(LEGACY_SPM), true);
  assert.equal(hasSystemAccess(LEGACY_SPM), false);
});

test("CAP-LEGACY: legacy ADMIN keeps both capabilities", () => {
  assert.equal(hasSharedControlAccess(LEGACY_ADMIN), true);
  assert.equal(hasSystemAccess(LEGACY_ADMIN), true);
});

test("CAP-DENY: CLUB_MANAGER / CITY_MANAGER / OPERATIONS_DIRECTOR / MANAGER and an ended PROJECT_ADMIN grant get no shared access", () => {
  for (const a of [actor({}), CLUB_MANAGER_ROLE, CLUB_MANAGER_GRANT, CITY_MANAGER_GRANT, OD_GRANT, MANAGER_GRANT]) {
    assert.equal(hasSharedControlAccess(a), false, JSON.stringify(a));
  }
  for (const status of ["ENDED", "SUSPENDED", "PENDING_APPROVAL"] as const) {
    assert.equal(hasSharedControlAccess(actor({ grants: [grant("PROJECT_ADMIN", status)] })), false, status);
  }
});

test("CAP-PREDICATE: the client-safe predicate is exactly system access OR legacy ADMIN OR legacy SPM", () => {
  for (const role of ["EMPLOYEE", "CLUB_MANAGER", "SPM", "ADMIN"] as const) {
    for (const sys of [false, true]) {
      assert.equal(isSharedControlRole(role, sys), sys || role === "ADMIN" || role === "SPM", `${role}/${sys}`);
    }
  }
});

/* ===================================================================== *
 *  Server guards
 * ===================================================================== */

const SHARED_ROUTES = [
  ...routes("src/app/api/admin"),
  ...routes("src/app/api/control/scripts"),
  ...routes("src/app/api/control/instructions"),
  ...routes("src/app/api/spm"),
];
const ADMIN_ONLY_ROUTES = [
  ...routes("src/app/api/control/metric"),
  ...routes("src/app/api/control/users"),
  ...routes("src/app/api/control/logs"),
  ...routes("src/app/api/control/admin"),
];

test("GUARD-SHARED: every content CMS, media upload, lesson/test, script, instruction and /spm API uses requireSharedControlAccess — and nothing narrower or wider", () => {
  assert.ok(SHARED_ROUTES.length >= 39, String(SHARED_ROUTES.length));
  for (const f of SHARED_ROUTES) {
    const c = code(f);
    assert.match(c, /await requireSharedControlAccess\(\)/, f);
    assert.doesNotMatch(c, /requireSystemAccess|requireSPMAccess|requireSPM\(|requireRole\(|requireAdmin\(|requireClubManagerAccess/, f);
  }
  assert.ok(SHARED_ROUTES.includes(join("src/app/api/admin/media/upload/route.ts")));
  assert.ok(SHARED_ROUTES.includes(join("src/app/api/admin/lessons/[id]/quiz/route.ts")));
  assert.ok(SHARED_ROUTES.includes(join("src/app/api/spm/mystery/[id]/publish/route.ts")));
});

test("GUARD-ADMIN-ONLY: Метрик, Сотрудники, Логи and the admin dashboard summary stay system-access only", () => {
  assert.ok(ADMIN_ONLY_ROUTES.length >= 10, String(ADMIN_ONLY_ROUTES.length));
  for (const f of ADMIN_ONLY_ROUTES) {
    const c = code(f);
    assert.match(c, /requireSystemAccess\(\)/, f);
    assert.doesNotMatch(c, /requireSharedControlAccess/, f);
  }
  // Роли keeps its own RBAC authorize()/canAssignRole path, untouched.
  for (const f of routes("src/app/api/control/roles")) assert.doesNotMatch(code(f), /requireSharedControlAccess/, f);
});

test("GUARD-PREVIEW: draft lesson preview is for content editors (shared), the published path is unchanged", () => {
  const c = code("src/app/api/academy/lessons/[slug]/route.ts");
  assert.match(c, /await requireSharedControlAccess\(\);/);
  assert.match(c, /requireActiveAccess/);
  assert.doesNotMatch(c, /requireSystemAccess/);
});

test("GUARD-PAGES: shared pages/layouts use hasSharedControlAccessForUser; admin-only pages keep hasSystemAccessForUser", () => {
  for (const f of ["src/app/admin/layout.tsx", "src/app/spm/(panel)/layout.tsx", "src/app/control/(portal)/scripts/page.tsx", "src/app/control/(portal)/instructions/page.tsx"]) {
    const c = code(f);
    assert.match(c, /hasSharedControlAccessForUser\(user\)/, f);
    assert.doesNotMatch(c, /canAccessSpm/, f);
  }
  for (const f of ["src/app/control/(portal)/metric/page.tsx", "src/app/control/(portal)/metric/documents/page.tsx", "src/app/control/(portal)/roles/page.tsx", "src/app/control/(portal)/users/page.tsx", "src/app/control/(portal)/logs/page.tsx"]) {
    const c = code(f);
    assert.match(c, /hasSystemAccessForUser/, f);
    assert.doesNotMatch(c, /hasSharedControlAccessForUser/, f);
  }
});

test("GUARD-CANONICAL: one implementation — requireSharedControlAccess resolves the REAL actor and calls hasSharedControlAccess; requireSPMAccess is only an alias", () => {
  const authz = code("src/lib/server/authz.ts");
  assert.match(authz, /export async function requireSharedControlAccess\(\): Promise<CurrentUser> \{\s*const user = await requireUser\(\);\s*if \(!hasSharedControlAccess\(await getActorContext\(user\)\)\)/);
  assert.match(authz, /export const requireSPMAccess = \(\) => requireSharedControlAccess\(\);/);
  assert.match(code("src/lib/server/rbac/authorize-core.ts"), /return isSharedControlRole\(actor\.appRole, hasSystemAccess\(actor\)\);/);
});

test("VIEW-AS: View As does not widen mutation authority — persona writes stay blocked by middleware and the guard reads the real session", () => {
  const mw = code("src/middleware.ts");
  assert.match(mw, /if \(payload\.role === "CITY_MANAGER"\) return NextResponse\.next\(\);/);
  assert.match(mw, /VIEW_AS_READ_ONLY/);
  assert.match(mw, /matcher: \["\/api\/:path\*"\]/);
  assert.doesNotMatch(code("src/lib/server/session.ts"), /view-?as/i);
  assert.doesNotMatch(code("src/lib/server/rbac/authorize-core.ts").match(/export function hasSharedControlAccess[\s\S]*?\n\}/)![0], /viewAs|persona/i);
});

/* ===================================================================== *
 *  Navigation
 * ===================================================================== */

const NONE: ControlNavFlags = { role: "EMPLOYEE", hasSystemAccess: false, isClubManager: false, isCityManager: false, isOperationsDirector: false };
const groups = (f: ControlNavFlags) => buildControlNav(f).map((g) => [g.title, g.items.map((i) => i.label)]);
const SYSTEM = ["Метрик", "Роли", "Сотрудники", "Логи", "Расходы Метрика", "Посещаемость"]; // QA-07 added the last two
const CONTENT = ["Обучение", "Скрипты", "Инструкции"];
const RESULTS = ["Тайный покупатель", "Продажи", "Рейтинг сотрудников"];

test("NAV-PA: PROJECT_ADMIN (grant-only and legacy) — Система, Контент, Контроль и результаты", () => {
  for (const f of [{ ...NONE, hasSystemAccess: true }, { ...NONE, role: "ADMIN" as const, hasSystemAccess: true }]) {
    assert.deepEqual(groups(f), [
      [null, ["Главная"]],
      ["Система", SYSTEM],
      ["Контент", CONTENT],
      ["Контроль и результаты", RESULTS],
    ]);
  }
});

test("NAV-SPM: SPM — Контент and Контроль и результаты only; no admin-only system sections", () => {
  assert.deepEqual(groups({ ...NONE, role: "SPM" }), [
    [null, ["Главная"]],
    ["Контент", CONTENT],
    ["Контроль и результаты", RESULTS],
  ]);
  const labels = flattenControlNav(buildControlNav({ ...NONE, role: "SPM" })).map((i) => i.label);
  for (const x of SYSTEM) assert.ok(!labels.includes(x), x);
});

test("NAV-NO-WIDENING: CLUB_MANAGER / CITY_MANAGER / OD get none of the shared or system sections", () => {
  for (const f of [{ ...NONE, role: "CLUB_MANAGER" as const }, { ...NONE, isClubManager: true }, { ...NONE, isCityManager: true }, { ...NONE, isOperationsDirector: true }]) {
    const labels = flattenControlNav(buildControlNav(f)).map((i) => i.label);
    for (const x of [...SYSTEM, ...CONTENT, ...RESULTS]) assert.ok(!labels.includes(x), `${JSON.stringify(f)} ${x}`);
  }
});
