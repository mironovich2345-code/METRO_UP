import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  INITIAL_ROLE_ASSIGNMENT_FORM,
  buildRoleAssignmentRequest,
  describeRoleAssignmentCreateError,
  roleAssignmentFormReducer,
  type RoleAssignmentFormAction,
  type RoleAssignmentFormState,
} from "../src/lib/control/role-assignment-form";
import {
  buildControlNav,
  controlNavItemMatches,
  flattenControlNav,
  resolveActiveControlNavItem,
  type ControlNavFlags,
} from "../src/lib/control/control-nav";

// tsx compiles .tsx with the classic JSX runtime (tsconfig jsx: "preserve"),
// so the component module needs React as a global when it is evaluated.
(globalThis as { React?: typeof React }).React = React;
const { Field, FieldGroup } = await import("../src/components/admin/ui");

const read = (p: string) => readFileSync(p, "utf8");
const run = (actions: RoleAssignmentFormAction[], from: RoleAssignmentFormState = INITIAL_ROLE_ASSIGNMENT_FORM) =>
  actions.reduce(roleAssignmentFormReducer, from);

const IVAN = { id: "u-ivan", displayName: "Иван Петров", clubName: "Полтавская" };

/* ===================================================================== *
 *  A. Role assignment — the selected user must stay selected
 * ===================================================================== */

test("RA-ROOT: Field is a <label> (a tap on it activates its first control) while FieldGroup is a plain group — the user picker now uses FieldGroup", () => {
  const asField = renderToStaticMarkup(createElement(Field as React.FC<{ label: string; children?: React.ReactNode }>, { label: "Пользователь" }, createElement("button", null, "Изменить")));
  assert.match(asField, /^<label/); // the bug: «Изменить» was the label's first labelable descendant
  const asGroup = renderToStaticMarkup(createElement(FieldGroup as React.FC<{ label: string; children?: React.ReactNode }>, { label: "Пользователь" }, createElement("button", null, "Изменить")));
  assert.doesNotMatch(asGroup, /<label/);
  assert.match(asGroup, /^<div role="group" aria-labelledby="([^"]+)"[^>]*><span id="\1"/);
  const roles = read("src/components/control/RolesAdmin.tsx");
  assert.match(roles, /<FieldGroup label="Пользователь">/);
  assert.doesNotMatch(roles, /<Field label="Пользователь">/);
  // The same picker pattern in the CLUB_MANAGER assignment modal (a caption tap selected the first employee).
  const clubModal = read("src/components/control/ClubManagerAssignModal.tsx");
  assert.match(clubModal, /<FieldGroup label="Сотрудник">/);
  assert.doesNotMatch(clubModal, /<Field label="Сотрудник">/);
});

test("RA-ROLE: select user -> choose role -> the user remains selected", () => {
  const s = run([{ type: "USER_SELECTED", user: IVAN }, { type: "ROLE_CHANGED", role: "OPERATIONS_DIRECTOR" }, { type: "ROLE_CHANGED", role: "CITY_MANAGER" }]);
  assert.deepEqual(s.selectedUser, IVAN);
  assert.equal(s.role, "CITY_MANAGER");
});

test("RA-SCOPE: select user -> choose scope type, city, club, comment -> the user remains selected", () => {
  const s = run([
    { type: "USER_SELECTED", user: IVAN },
    { type: "SCOPE_TYPE_CHANGED", scopeType: "CLUB" },
    { type: "CLUB_CHANGED", clubId: "poltava" },
    { type: "SCOPE_TYPE_CHANGED", scopeType: "CITY" },
    { type: "CITY_CHANGED", cityId: "nn" },
    { type: "REASON_CHANGED", reason: "по приказу" },
  ]);
  assert.deepEqual(s.selectedUser, IVAN);
  assert.equal(s.cityId, "nn");
  assert.equal(s.clubId, "poltava");
});

test("RA-REFETCH: a late search/query event never replaces or clears the chosen user; search results live outside the form state", () => {
  const s = run([{ type: "QUERY_CHANGED", query: "Ив" }, { type: "USER_SELECTED", user: IVAN }, { type: "QUERY_CHANGED", query: "Иван" }]);
  assert.deepEqual(s.selectedUser, IVAN);
  const roles = read("src/components/control/RolesAdmin.tsx");
  assert.match(roles, /const \[matches, setMatches\] = useState<AdminUserRowDTO\[\]>\(\[\]\);/);
  assert.match(roles, /const searching = !form\.selectedUser && form\.query\.trim\(\)\.length > 0;/);
  assert.doesNotMatch(roles, /setSelected\(/); // no ad-hoc selection setter left
});

test("RA-CLEAR: only «Изменить» (USER_CLEARED) clears the user explicitly", () => {
  assert.equal(run([{ type: "USER_SELECTED", user: IVAN }, { type: "USER_CLEARED" }]).selectedUser, null);
});

test("RA-SUCCESS: a successful assignment resets to a fresh form (the intended post-success state)", () => {
  const s = run([{ type: "USER_SELECTED", user: IVAN }, { type: "CITY_CHANGED", cityId: "nn" }, { type: "SUBMIT_STARTED" }, { type: "SUBMIT_SUCCEEDED" }]);
  assert.deepEqual(s, INITIAL_ROLE_ASSIGNMENT_FORM);
});

test("RA-FAIL: a failed mutation keeps the user and every entered value, and shows the error", () => {
  const before = run([
    { type: "USER_SELECTED", user: IVAN },
    { type: "SCOPE_TYPE_CHANGED", scopeType: "CLUB" },
    { type: "CLUB_CHANGED", clubId: "poltava" },
    { type: "REASON_CHANGED", reason: "x" },
    { type: "SUBMIT_STARTED" },
  ]);
  assert.equal(before.submitting, true);
  const after = roleAssignmentFormReducer(before, { type: "SUBMIT_FAILED", error: describeRoleAssignmentCreateError("assignment_already_active") });
  assert.deepEqual({ ...after, error: null, submitting: true }, before);
  assert.equal(after.submitting, false);
  assert.equal(after.error, "Такое назначение уже активно.");
  assert.equal(describeRoleAssignmentCreateError("operations_director_limit_reached"), "Достигнут лимит активных операционных директоров.");
});

test("RA-REQUEST: the request shapes are unchanged (OD -> NETWORK, CITY_MANAGER -> CITY or CLUB) and an empty city/club is caught before submit", () => {
  assert.deepEqual(buildRoleAssignmentRequest(INITIAL_ROLE_ASSIGNMENT_FORM), { ok: false, error: "Выберите пользователя." });
  const withUser = run([{ type: "USER_SELECTED", user: IVAN }]);
  assert.deepEqual(buildRoleAssignmentRequest(withUser), { ok: false, error: "Выберите город." });
  assert.deepEqual(buildRoleAssignmentRequest(run([{ type: "CITY_CHANGED", cityId: "nn" }], withUser)), {
    ok: true,
    body: { userId: "u-ivan", role: "CITY_MANAGER", scopeType: "CITY", cityId: "nn", reason: undefined },
  });
  const club = run([{ type: "SCOPE_TYPE_CHANGED", scopeType: "CLUB" }], withUser);
  assert.deepEqual(buildRoleAssignmentRequest(club), { ok: false, error: "Выберите клуб." });
  assert.deepEqual(buildRoleAssignmentRequest(run([{ type: "CLUB_CHANGED", clubId: "poltava" }, { type: "REASON_CHANGED", reason: "  приказ  " }], club)), {
    ok: true,
    body: { userId: "u-ivan", role: "CITY_MANAGER", scopeType: "CLUB", clubId: "poltava", reason: "приказ" },
  });
  assert.deepEqual(buildRoleAssignmentRequest(run([{ type: "ROLE_CHANGED", role: "OPERATIONS_DIRECTOR" }], withUser)), {
    ok: true,
    body: { userId: "u-ivan", role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", reason: undefined },
  });
});

test("RA-ONE-PATH: mobile and desktop share one form and one mutation (rolesApi.create) — no second assignment system", () => {
  const roles = read("src/components/control/RolesAdmin.tsx");
  assert.equal((roles.match(/rolesApi\.create\(/g) ?? []).length, 1);
  assert.equal((roles.match(/<CreateAssignmentModal\b/g) ?? []).length, 1);
  assert.match(roles, /const request = buildRoleAssignmentRequest\(form\);/);
  // Every button in the form is an explicit, non-submitting button.
  const modal = roles.slice(roles.indexOf("function CreateAssignmentModal"));
  assert.equal((modal.match(/<button\b/g) ?? []).length, (modal.match(/<button\s+type="button"/g) ?? []).length);
  // Server rules are untouched: the create route still goes through canAssignRole.
  assert.match(read("src/lib/server/rbac/role-assignment-service.ts"), /canAssignRole|authorize\(/);
});

/* ===================================================================== *
 *  C. Control navigation
 * ===================================================================== */

const NONE: ControlNavFlags = { role: "EMPLOYEE", hasSystemAccess: false, isClubManager: false, isCityManager: false, isOperationsDirector: false };
const hrefs = (flags: ControlNavFlags) => flattenControlNav(buildControlNav(flags)).map((i) => i.href);

/** Every URL that has a page.tsx under src/app (route groups stripped). */
function appRoutes(): Set<string> {
  const root = "src/app";
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") {
        const segs = relative(root, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
        out.add(`/${segs.join("/")}`);
      }
    }
  };
  walk(root);
  return out;
}

test("NAV-ROUTES: every nav item points at a real page (no dead links), for every permission combination", () => {
  const routes = appRoutes();
  const everything: ControlNavFlags = { role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true };
  for (const href of hrefs(everything)) assert.ok(routes.has(href), `missing page for ${href}`);
});

test("NAV-ADMIN (updated for QA-06): a legacy ADMIN gets Система, Контент and Контроль и результаты — no club/city cabinets unless they really hold those roles", () => {
  assert.deepEqual(hrefs({ ...NONE, role: "ADMIN", hasSystemAccess: true }), [
    "/control",
    "/control/metric",
    "/control/roles",
    "/control/users",
    "/control/logs",
    "/admin/content",
    "/control/scripts",
    "/control/instructions",
    "/spm/mystery",
    "/spm/sales",
    "/spm/rating",
  ]);
});

test("NAV-RBAC (updated for QA-06.1): each group appears only for the role whose server guard admits it — no widening", () => {
  assert.deepEqual(hrefs(NONE), ["/control"]);
  // PROJECT_ADMIN by grant only (AppRole EMPLOYEE): system + the shared content and results.
  assert.deepEqual(hrefs({ ...NONE, hasSystemAccess: true }), ["/control", "/control/metric", "/control/roles", "/control/users", "/control/logs", "/admin/content", "/control/scripts", "/control/instructions", "/spm/mystery", "/spm/sales", "/spm/rating"]);
  for (const f of [{ ...NONE, role: "CLUB_MANAGER" as const }, { ...NONE, isClubManager: true }]) {
    assert.deepEqual(hrefs(f), ["/control", "/control/club", "/control/plan"]);
  }
  assert.deepEqual(hrefs({ ...NONE, isCityManager: true }), ["/control", "/control/city"]);
  assert.deepEqual(hrefs({ ...NONE, isOperationsDirector: true }), ["/control", "/control/network"]);
  // SPM: the shared content + results — never system or role administration.
  assert.deepEqual(hrefs({ ...NONE, role: "SPM" }), ["/control", "/admin/content", "/control/scripts", "/control/instructions", "/spm/mystery", "/spm/sales", "/spm/rating"]);
});

test("NAV-ACTIVE: the current section is resolved for every page, sub-routes included; segment-aware; null outside the nav", () => {
  const groups = buildControlNav({ role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true });
  const label = (p: string) => resolveActiveControlNavItem(groups, p)?.label ?? null;
  assert.equal(label("/control"), "Главная");
  assert.equal(label("/control/roles"), "Роли");
  assert.equal(label("/control/users"), "Сотрудники");
  assert.equal(label("/control/city/club"), "Мои клубы");
  assert.equal(label("/control/metric/documents"), "Метрик");
  assert.equal(label("/admin/content/lessons/abc"), "Обучение");
  assert.equal(label("/spm/mystery"), "Тайный покупатель");
  assert.equal(label("/control/cityx"), null);
  assert.equal(label("/admin"), null);
  assert.equal(resolveActiveControlNavItem(groups, null), null);
  const home = flattenControlNav(groups)[0];
  assert.equal(controlNavItemMatches(home, "/control/roles"), false); // Главная is exact
});

test("NAV-GROUPS (updated for QA-06): sections are grouped; every group has items; no duplicate destinations", () => {
  const groups = buildControlNav({ role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true });
  assert.deepEqual(groups.map((g) => g.title), [null, "Система", "Контент", "Контроль и результаты", "Клуб", "Город", "Сеть"]);
  for (const g of groups) assert.ok(g.items.length > 0);
  const all = hrefs({ role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true });
  assert.equal(new Set(all).size, all.length);
});

test("NAV-MOBILE: the mobile header no longer renders the horizontally scrolling strip — one «Разделы» button naming the current section opens a grouped sheet; desktop and mobile use the SAME model", () => {
  const shell = read("src/components/control/ControlShell.tsx");
  assert.doesNotMatch(shell, /overflow-x-auto/);
  assert.match(shell, /const groups = buildControlNav\(\{ role, hasSystemAccess: isAdmin, isClubManager, isCityManager, isOperationsDirector \}\);/);
  assert.match(shell, /<span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">\{selector\.label\}<\/span>/);
  assert.match(shell, /\{menuOpen && <ControlSectionsSheet groups=\{groups\} pathname=\{pathname\} onClose=\{closeMenu\} \/>\}/);
  // Desktop sidebar renders the same groups.
  assert.match(shell, /<nav className="mt-8[^"]*" aria-label="Разделы">\s*\n\s*<ControlNavGroups groups=\{groups\} pathname=\{pathname\} \/>/);
  // The sheet is hidden on desktop and lives outside the blurred sticky header.
  assert.match(shell, /<div className="fixed inset-0 z-50 md:hidden">/);
});

test("NAV-HOME (updated for QA-05.1): Home no longer carries navigation cards — every former card destination is in the nav instead", () => {
  const dash = read("src/components/control/ControlDashboard.tsx");
  assert.doesNotMatch(dash, /const CARDS/);
  const all = hrefs({ role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true });
  for (const href of ["/admin/content", "/control/scripts", "/control/instructions", "/control/users", "/control/roles", "/control/metric", "/control/plan", "/control/city", "/control/network", "/spm/sales", "/spm/mystery", "/spm/rating"]) {
    assert.ok(all.includes(href), href);
  }
});
