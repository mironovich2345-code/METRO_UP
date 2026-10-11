import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import type { AppRole } from "@prisma/client";
import {
  CLUB_ACCESS_LABEL,
  applyMemberAccessStatus,
  describeClubAccessError,
  nextClubAccessAction,
} from "../src/lib/control/club-access";
import {
  buildControlNav,
  describeControlNavSelector,
  flattenControlNav,
  resolveActiveControlNavItem,
  type ControlNavFlags,
} from "../src/lib/control/control-nav";
import { canAccessSpm, canManageClub } from "../src/lib/roles";
import { resolveManagedClubSelection } from "../src/lib/cabinet-ui";
import { ApiError } from "../src/lib/api/client";
import type { AccessStatusDTO } from "../src/lib/api/types";

// tsx compiles .tsx with the classic JSX runtime — React must be global
// before a component module is evaluated.
(globalThis as { React?: typeof React }).React = React;
const { runClubAccessAction } = await import("../src/components/control/ClubAccessAction");

const read = (p: string) => readFileSync(p, "utf8");
const navHrefs = (f: ControlNavFlags) => flattenControlNav(buildControlNav(f)).map((i) => i.href);

/** Every permission combination the Control layout can produce. */
function allFlagCombos(): ControlNavFlags[] {
  const out: ControlNavFlags[] = [];
  for (const role of ["EMPLOYEE", "CLUB_MANAGER", "SPM", "ADMIN"] as AppRole[])
    for (const hasSystemAccess of [false, true])
      for (const isClubManager of [false, true])
        for (const isCityManager of [false, true])
          for (const isOperationsDirector of [false, true]) out.push({ role, hasSystemAccess, isClubManager, isCityManager, isOperationsDirector });
  return out;
}

/* ===================================================================== *
 *  A. Control Home
 * ===================================================================== */

/** The Home cards as they existed before QA-05.1 (href + its visibility
 * rule, copied from the removed CARDS table) — the reachability contract. */
const REMOVED_HOME_CARDS: { href: string; can: (f: ControlNavFlags) => boolean }[] = [
  { href: "/admin/content", can: (f) => f.hasSystemAccess },
  { href: "/control/scripts", can: (f) => f.hasSystemAccess },
  { href: "/control/instructions", can: (f) => f.hasSystemAccess },
  { href: "/control/users", can: (f) => f.hasSystemAccess },
  { href: "/control/roles", can: (f) => f.hasSystemAccess },
  { href: "/control/metric", can: (f) => f.hasSystemAccess },
  { href: "/control/plan", can: (f) => canManageClub(f.role) || f.isClubManager },
  { href: "/control/team", can: (f) => canManageClub(f.role) || f.isClubManager },
  { href: "/control/city", can: (f) => f.isCityManager },
  { href: "/control/network", can: (f) => f.isOperationsDirector },
  { href: "/spm/sales", can: (f) => canAccessSpm(f.role) },
  { href: "/spm/mystery", can: (f) => canAccessSpm(f.role) },
  { href: "/spm/rating", can: (f) => canAccessSpm(f.role) },
];

test("HOME-REACH: for EVERY permission combination, every destination a removed Home card offered is still in that actor's nav (Команда via «Управляющий», which links on to /control/team)", () => {
  for (const f of allFlagCombos()) {
    const nav = navHrefs(f);
    for (const card of REMOVED_HOME_CARDS) {
      if (!card.can(f)) continue;
      const expected = card.href === "/control/team" ? "/control/club" : card.href;
      assert.ok(nav.includes(expected), `${JSON.stringify(f)} lost ${card.href}`);
    }
  }
  // «Метрик» specifically (it used to be Home-only).
  assert.ok(navHrefs({ role: "EMPLOYEE", hasSystemAccess: true, isClubManager: false, isCityManager: false, isOperationsDirector: false }).includes("/control/metric"));
});

test("HOME-NO-WALL: Home has no navigation-card table and links to exactly one destination (the learning summary's own section)", () => {
  const dash = read("src/components/control/ControlDashboard.tsx");
  assert.doesNotMatch(dash, /const CARDS|CardDef|\.filter\(\(c\) => c\.can/);
  const links = dash.match(/href="[^"]+"/g) ?? [];
  assert.deepEqual(links, ['href="/admin/content"']);
});

test("HOME-REAL-DATA: the learning summary keeps its real counts from the SAME existing call — no new API, no invented metric", () => {
  const dash = read("src/components/control/ControlDashboard.tsx");
  assert.match(dash, /adminApi\s*\n?\s*\.dashboard\(\)/);
  for (const field of ["dash.totals.programs", "dash.totals.lessonsPublished", "dash.totals.lessonsDraft"]) assert.ok(dash.includes(field), field);
  // The only data source is adminApi.dashboard; gated by system access exactly like the old card.
  const codeOnly = dash.replace(/\/\*[\s\S]*?\*\//g, "");
  const apis = new Set(codeOnly.match(/\b\w+Api\b/g) ?? []);
  assert.deepEqual([...apis], ["adminApi"]);
  assert.deepEqual(codeOnly.match(/adminApi\s*\n?\s*\.(\w+)\(/g)?.map((m) => m.replace(/\s+/g, "")), ["adminApi.dashboard("]);
  assert.match(dash, /if \(hasSystemAccess\) \{/);
  assert.match(dash, /\{hasSystemAccess && \(/);
});

test("HOME-SECTIONS-BUTTON (updated for QA-05.2): Home no longer duplicates the section selector — no «Открыть разделы», no event plumbing, no navigation rebuilt", () => {
  const dash = read("src/components/control/ControlDashboard.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(dash, /Открыть разделы|dispatchEvent|CONTROL_OPEN_SECTIONS_EVENT|buildControlNav/);
  assert.doesNotMatch(read("src/components/control/ControlShell.tsx"), /CONTROL_OPEN_SECTIONS_EVENT/);
});

/* ===================================================================== *
 *  B. «Управляющий» absorbs «Команда»
 * ===================================================================== */

test("TEAM-MAP: the access lifecycle is exactly /control/team's — approval and un-suspension are DIFFERENT actions on different endpoints", () => {
  assert.deepEqual(nextClubAccessAction("PENDING_APPROVAL"), { kind: "approve", label: "Подтвердить", endpoint: "approve", target: "FULL", destructive: false });
  assert.deepEqual(nextClubAccessAction("LIMITED"), { kind: "grant_full", label: "Выдать полный доступ", endpoint: "setAccess", target: "FULL", destructive: false });
  assert.deepEqual(nextClubAccessAction("FULL"), { kind: "suspend", label: "Приостановить", endpoint: "setAccess", target: "SUSPENDED", destructive: true });
  assert.deepEqual(nextClubAccessAction("SUSPENDED"), { kind: "restore", label: "Восстановить", endpoint: "setAccess", target: "FULL", destructive: false });
  assert.equal(CLUB_ACCESS_LABEL.FULL, "Полный доступ");
  assert.equal(CLUB_ACCESS_LABEL.SUSPENDED, "Доступ приостановлен");
});

async function withFetch<T>(status: number, body: unknown, fn: (calls: { url: string; init?: RequestInit }[]) => Promise<T>): Promise<T> {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("TEAM-CALLS: each status drives the SAME existing endpoint with the server-resolved club — PENDING -> approve(FULL); LIMITED -> FULL; FULL -> SUSPENDED; SUSPENDED -> restore FULL", async () => {
  const cases: { status: AccessStatusDTO; path: string; body: Record<string, unknown> }[] = [
    { status: "PENDING_APPROVAL", path: "/api/control/team/u1/approve?clubId=club-a", body: { accessStatus: "FULL" } },
    { status: "LIMITED", path: "/api/control/team/u1/access?clubId=club-a", body: { accessStatus: "FULL" } },
    { status: "FULL", path: "/api/control/team/u1/access?clubId=club-a", body: { accessStatus: "SUSPENDED" } },
    { status: "SUSPENDED", path: "/api/control/team/u1/access?clubId=club-a", body: { accessStatus: "FULL" } },
  ];
  for (const c of cases) {
    const target = nextClubAccessAction(c.status).target;
    await withFetch(200, { userId: "u1", accessStatus: target }, async (calls) => {
      const next = await runClubAccessAction(nextClubAccessAction(c.status), "u1", "club-a");
      assert.equal(next, target);
      assert.equal(calls.length, 1, c.status);
      assert.equal(calls[0].url, c.path, c.status);
      assert.equal(calls[0].init?.method, "POST");
      const sent = JSON.parse(String(calls[0].init?.body));
      for (const [k, v] of Object.entries(c.body)) assert.equal(sent[k], v, c.status);
    });
  }
});

test("TEAM-FAIL: a failed mutation rejects (nothing applied) and maps to a clear message; applying a confirmed status touches only that row", async () => {
  await withFetch(409, { error: "pending_approval" }, async () => {
    await assert.rejects(runClubAccessAction(nextClubAccessAction("LIMITED"), "u1", "club-a"), (e: unknown) => e instanceof ApiError && e.status === 409);
  });
  assert.equal(describeClubAccessError(new ApiError(409, "not_pending")), "Заявка уже обработана. Обновите список.");
  assert.equal(describeClubAccessError(new ApiError(403, "VIEW_AS_READ_ONLY")), "Изменение доступа недоступно в режиме просмотра.");
  assert.equal(describeClubAccessError(new ApiError(403, "employee_not_in_club")), "Недостаточно прав для изменения доступа.");
  assert.equal(describeClubAccessError(new TypeError("network")), "Не удалось изменить доступ. Проверьте соединение.");
  const rows = [{ userId: "a", accessStatus: "LIMITED" as AccessStatusDTO }, { userId: "b", accessStatus: "PENDING_APPROVAL" as AccessStatusDTO }];
  assert.deepEqual(applyMemberAccessStatus(rows, "a", "FULL"), [{ userId: "a", accessStatus: "FULL" }, rows[1]]);
  // The button only reports success through onApplied, failure only through onError.
  const btn = read("src/components/control/ClubAccessAction.tsx");
  assert.match(btn, /onApplied\(userId, await runClubAccessAction\(action, userId, clubId\)\);\s*\n\s*\} catch \(e\) \{\s*\n\s*onError\(describeClubAccessError\(e\)\);/);
});

test("TEAM-IN-CABINET: «Управляющий» renders the shared action on every team row (cards on mobile, table on desktop) and on «Новые сотрудники», scoped to the server-resolved club, hidden during View As", () => {
  const cab = read("src/components/control/ClubManagerCabinet.tsx");
  assert.equal((cab.match(/<ClubAccessActionButton\b/g) ?? []).length, 3);
  assert.equal((cab.match(/clubId=\{dashboard\.clubId\}/g) ?? []).length, 3);
  assert.match(cab, /const canChangeAccess = dashboard \? !dashboard\.isPreviewing : false;/);
  assert.equal((cab.match(/\{canChangeAccess && \(/g) ?? []).length, 3);
  assert.doesNotMatch(cab, /managerApi\.(approve|setAccess)\(/); // no private copy of the mutation
  // The server write guard for View As is untouched.
  assert.match(read("src/middleware.ts"), /VIEW_AS_READ_ONLY/);
});

test("TEAM-MULTICLUB: club resolution is the existing eligible-club model — one club auto-resolves, several require a pick, none -> admin list (existing team scope) or «не назначены»", () => {
  const one = [{ id: "a", name: "A", cityId: "c", cityName: "C" }];
  const two = [...one, { id: "b", name: "B", cityId: "c", cityName: "C" }];
  assert.equal(resolveManagedClubSelection(one).kind, "auto");
  assert.equal(resolveManagedClubSelection(two).kind, "select");
  assert.equal(resolveManagedClubSelection([]).kind, "none");
  const cab = read("src/components/control/ClubManagerCabinet.tsx");
  assert.match(cab, /const selection = resolveManagedClubSelection\(clubs\);/);
  assert.match(cab, /const \{ scope \} = await managerApi\.team\(null\)\.catch\(\(\) => \(\{ scope: null \}\)\);\s*\n\s*if \(scope\?\.canSwitch && scope\.clubs\.length > 0\) \{/);
  assert.match(cab, /\{!dashboard\.isPreviewing && candidates\.length > 1 && \(/); // «Сменить клуб» only among the actor's own candidates
});

/* ===================================================================== *
 *  C. /control/team compatibility
 * ===================================================================== */

test("TEAM-COMPAT: /control/team still exists, honours ?clubId (server-verified), shares the SAME action implementation, and points to «Управляющий»", () => {
  const page = read("src/app/control/(portal)/team/page.tsx");
  assert.match(page, /useState<string \| null>\(\(\) => searchParams\.get\("clubId"\)\)/);
  assert.match(page, /<ClubAccessActionButton userId=\{m\.userId\} status=\{m\.accessStatus\} clubId=\{scopeClubId\}/);
  assert.doesNotMatch(page, /function nextAction|const ACCESS_LABEL/); // no second copy of the mapping
  assert.match(page, /`\/control\/club\?clubId=\$\{encodeURIComponent\(team\.clubId\)\}`/);
  assert.match(page, /<Suspense/);
  // The cabinet links to it for the per-employee plan/lessons table.
  assert.match(read("src/components/control/ClubManagerCabinet.tsx"), /href=\{`\/control\/team\?clubId=\$\{encodeURIComponent\(dashboard\.clubId\)\}`\}/);
});

/* ===================================================================== *
 *  D. Navigation
 * ===================================================================== */

const ADMIN_ALL: ControlNavFlags = { role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true };

test("NAV-NO-TEAM: «Команда» is not a primary item for anyone; /control/team still resolves to «Управляющий» as the current section", () => {
  for (const f of allFlagCombos()) assert.ok(!navHrefs(f).includes("/control/team"));
  const groups = buildControlNav(ADMIN_ALL);
  assert.equal(resolveActiveControlNavItem(groups, "/control/team")?.label, "Управляющий");
  assert.equal(resolveActiveControlNavItem(groups, "/control/club")?.label, "Управляющий");
  assert.equal(resolveActiveControlNavItem(groups, "/control/teamx"), null);
});

test("NAV-IA-V2: the grouped IA matches the target (empty groups never shown)", () => {
  const groups = buildControlNav(ADMIN_ALL);
  assert.deepEqual(
    groups.map((g) => [g.title, g.items.map((i) => i.label)]),
    [
      [null, ["Главная"]],
      ["Контент", ["Обучение", "Скрипты", "Инструкции", "Метрик"]],
      ["Люди и доступ", ["Сотрудники", "Роли"]],
      ["Клуб", ["Управляющий", "План дня"]],
      ["Город", ["Мои клубы"]],
      ["Сеть", ["Сеть"]],
      ["Продажи и рейтинг", ["Продажи", "Тайный покупатель", "Рейтинг"]],
    ],
  );
  for (const f of allFlagCombos()) for (const g of buildControlNav(f)) assert.ok(g.items.length > 0);
});

test("NAV-SAME-PERMISSIONS: for every permission combination the only difference from QA-05 is the removed «Команда»", () => {
  for (const f of allFlagCombos()) {
    const before = REMOVED_HOME_CARDS.filter((c) => c.can(f)).map((c) => c.href).filter((h) => h !== "/control/team");
    const nav = navHrefs(f).filter((h) => h !== "/control" && h !== "/control/club");
    assert.deepEqual([...nav].sort(), [...before].sort(), JSON.stringify(f));
    assert.equal(navHrefs(f).includes("/control/club"), canManageClub(f.role) || f.isClubManager);
  }
});

test("NAV-SELECTOR (updated for QA-05.2): the closed mobile selector shows ONLY the current section — no group suffix — with a full accessible name; the sheet keeps its safe area", () => {
  const groups = buildControlNav(ADMIN_ALL);
  assert.deepEqual(describeControlNavSelector(groups, "/admin/content"), { label: "Обучение", ariaLabel: "Открыть разделы. Текущий раздел: Обучение" });
  assert.deepEqual(describeControlNavSelector(groups, "/control"), { label: "Главная", ariaLabel: "Открыть разделы. Текущий раздел: Главная" });
  assert.deepEqual(describeControlNavSelector(groups, "/admin"), { label: "Выберите раздел", ariaLabel: "Открыть разделы" });
  const shell = read("src/components/control/ControlShell.tsx");
  assert.match(shell, /aria-label=\{selector\.ariaLabel\}/);
  assert.doesNotMatch(shell, />Разделы<\/span>/);
  assert.match(shell, /pb-\[calc\(env\(safe-area-inset-bottom\)\+12px\)\]/);
  assert.match(shell, /<nav className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-2"/);
});
