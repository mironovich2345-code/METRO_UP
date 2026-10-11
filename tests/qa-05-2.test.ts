import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminUserRowDTO } from "../src/lib/api/knowledge-types";
import type { ClubManagerAssignmentDTO } from "../src/lib/api/cabinet-types";
import { buildControlNav, describeControlNavSelector } from "../src/lib/control/control-nav";
import { describeAdminUserRow } from "../src/lib/control/users-view";
import { BOTTOM_NAV_CLEARANCE_CLASS, BOTTOM_NAV_GEOMETRY, bottomNavClearancePx } from "../src/lib/bottom-nav-clearance";

// tsx compiles .tsx with the classic JSX runtime — React must be global
// before a component module is evaluated.
(globalThis as { React?: typeof React }).React = React;
const { UsersResults } = await import("../src/components/control/UsersAdmin");
const { ClubManagersList } = await import("../src/components/control/CityManagerCabinet");

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/* ===================================================================== *
 *  1. Control Home
 * ===================================================================== */

test("HOME: the explanatory copy and the duplicate «Открыть разделы» are gone; the real learning summary stays; no card wall", () => {
  const dash = code("src/components/control/ControlDashboard.tsx");
  assert.doesNotMatch(dash, /Разделы панели|Открыть разделы|текущее состояние|dispatchEvent/);
  assert.match(dash, /<h1 className="text-2xl font-bold">METRO UP Control<\/h1>/);
  assert.match(dash, /\{displayName\} · \{ROLE_LABEL\[role\] \?\? role\}/);
  for (const f of ["dash.totals.programs", "dash.totals.lessonsPublished", "dash.totals.lessonsDraft"]) assert.ok(dash.includes(f), f);
  assert.deepEqual([...new Set(dash.match(/href="[^"]+"/g) ?? [])].sort(), ['href="/admin/content"', 'href="/control/logs"', 'href="/questions"']);
  assert.doesNotMatch(dash, /const CARDS/);
});

/* ===================================================================== *
 *  2. Mobile selector
 * ===================================================================== */

test("SELECTOR: the closed selector shows only the section name (no «· group»); the accessible name still names it", () => {
  const groups = buildControlNav({ role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true });
  const cases: [string, string][] = [
    ["/control", "Главная"],
    ["/control/users", "Сотрудники"],
    ["/control/roles", "Роли"],
    ["/control/club", "Управляющий"],
    ["/control/plan", "План дня"],
    ["/control/city", "Мои клубы"],
  ];
  for (const [path, label] of cases) {
    const d = describeControlNavSelector(groups, path);
    assert.equal(d.label, label);
    assert.doesNotMatch(d.label, /·|Люди и доступ|Клуб$|Город/);
    assert.equal(d.ariaLabel, `Открыть разделы. Текущий раздел: ${label}`);
  }
  const shell = code("src/components/control/ControlShell.tsx");
  assert.doesNotMatch(shell, /selector\.context/);
  // The sheet and sidebar still show the group headings.
  assert.match(shell, /\{group\.title && <p className="px-3 text-\[11px\] font-semibold uppercase/);
});

/* ===================================================================== *
 *  3. /control/users — one dataset, cards on phones, table on desktop
 * ===================================================================== */

const user = (over: Partial<AdminUserRowDTO>): AdminUserRowDTO => ({
  id: "u",
  displayName: "Имя",
  telegramUsername: null,
  role: "EMPLOYEE",
  cityId: "nn",
  cityName: "Нижний Новгород",
  clubId: "p",
  clubName: "Полтавская",
  positionId: "CLIENT_MANAGER",
  accessStatus: "FULL",
  hasProfile: true,
  ...over,
});

const USERS: AdminUserRowDTO[] = [
  user({ id: "u1", displayName: "Константин Константинопольский-Длиннофамильный", telegramUsername: "a_very_long_telegram_username_for_layout" }),
  user({ id: "me", displayName: "Данила Миронович", role: "ADMIN", telegramUsername: "danila", accessStatus: null, positionId: null }),
  user({ id: "u3", displayName: "Савельева Алёна", cityName: null, clubName: null, accessStatus: "PENDING_APPROVAL" }),
];

function sliceBetween(html: string, start: string, end: string): string {
  return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
}

test("USERS-PARITY: the SAME list renders as mobile cards and desktop rows — every field and the «Изменить» action in both", () => {
  const html = renderToStaticMarkup(createElement(UsersResults, { users: USERS, status: "ready", currentUserId: "me", onEdit: () => {} }));
  assert.equal(count(html, /data-user-card="/g), USERS.length);
  assert.equal(count(html, /data-user-row="/g), USERS.length);
  const cards = sliceBetween(html, "<ul", "</ul>");
  const table = sliceBetween(html, "<table", "</table>");
  for (const u of USERS) {
    const v = describeAdminUserRow(u, "me");
    for (const part of [v.name, v.telegram, v.city, v.club, v.position, v.roleLabel, v.access]) {
      assert.ok(cards.includes(part), `card missing «${part}» for ${u.id}`);
      assert.ok(table.includes(part), `row missing «${part}» for ${u.id}`);
    }
  }
  assert.equal(count(cards, /Изменить/g), USERS.length);
  assert.equal(count(table, /Изменить/g), USERS.length);
  assert.equal(count(cards, /\(вы\)/g), 1);
  assert.equal(count(table, /\(вы\)/g), 1);
});

test("USERS-LAYOUT: cards below md, the original table from md; long names/usernames wrap instead of widening the page", () => {
  const html = renderToStaticMarkup(createElement(UsersResults, { users: USERS, status: "ready", currentUserId: "me", onEdit: () => {} }));
  assert.match(html, /<ul class="mt-4 flex flex-col gap-2 md:hidden"/);
  assert.match(html, /<div class="mt-4 hidden overflow-x-auto rounded-3xl border border-border md:block"><table class="w-full min-w-\[880px\]/);
  assert.match(html, /<p class="font-semibold \[overflow-wrap:anywhere\]">Константин/);
  assert.match(html, /\[overflow-wrap:anywhere\]">@a_very_long_telegram_username_for_layout/);
  const empty = renderToStaticMarkup(createElement(UsersResults, { users: [], status: "ready", currentUserId: "me", onEdit: () => {} }));
  assert.equal(count(empty, /Сотрудники не найдены/g), 2);
});

test("USERS-DATA: filtering and loading are unchanged — one fetch with the same filter params feeds the shared results", () => {
  const src = read("src/components/control/UsersAdmin.tsx");
  assert.match(src, /const data = await usersAdminApi\.list\(\{\s*\n\s*cityId: filter\.cityId \|\| undefined,\s*\n\s*clubId: filter\.clubId \|\| undefined,\s*\n\s*role: filter\.role \|\| undefined,\s*\n\s*positionId: filter\.positionId \|\| undefined,\s*\n\s*q: filter\.q \|\| undefined,/);
  assert.equal(count(src, /<UsersResults\b/g), 1);
  assert.match(src, /<UsersResults users=\{users\} status=\{status\} currentUserId=\{currentUserId\} onEdit=\{openEdit\} \/>/);
});

/* ===================================================================== *
 *  4. /control/plan — no overlap
 * ===================================================================== */

test("PLAN: on phones the controls stack (date and «Создать задачу» are separate full-width rows); from sm the original row; same create action", () => {
  const src = read("src/app/control/(portal)/plan/page.tsx");
  assert.match(src, /data-plan-controls className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end"/);
  assert.match(src, /className=\{`\$\{fieldCls\} min-h-11 w-full min-w-0 sm:w-\[170px\]`\}/);
  assert.doesNotMatch(src, /\$\{fieldCls\} w-\[170px\]/); // the fixed-width box that iOS overflowed
  assert.match(src, /className="flex h-11 w-full items-center justify-center gap-1\.5 rounded-2xl bg-brand[^"]*sm:w-auto"/);
  assert.match(src, /onClick=\{\(\) => setShowCreate\(true\)\}\s*\n\s*disabled=\{!plan\?\.clubId\}/);
  assert.doesNotMatch(src, /absolute[^"]*Создать/);
});

/* ===================================================================== *
 *  5. /control/city — Управляющие
 * ===================================================================== */

const MANAGERS = [
  { assignmentId: "a1", userId: "x1", displayName: "Крис", clubId: "c1", clubName: "Полтавская", startedAt: "2026-09-29T00:00:00.000Z" },
  { assignmentId: "a2", userId: "x2", displayName: "Савельева Алёна", clubId: "c2", clubName: "Циолковского — очень длинное название клуба", startedAt: "2026-10-11T00:00:00.000Z" },
] as unknown as ClubManagerAssignmentDTO[];

test("CITY-MANAGERS: the same managers render as mobile cards and desktop rows — name, club link, assignment date and «Отозвать» in both", () => {
  const html = renderToStaticMarkup(createElement(ClubManagersList, { managers: MANAGERS, busyId: null, onRevoke: () => {} }));
  assert.equal(count(html, /data-manager-card="/g), 2);
  assert.equal(count(html, /data-manager-row="/g), 2);
  const cards = sliceBetween(html, "<ul", "</ul>");
  const table = sliceBetween(html, "<table", "</table>");
  for (const m of MANAGERS) {
    const date = new Date(m.startedAt).toLocaleDateString("ru-RU");
    for (const part of [m.displayName, m.clubName, date, `/control/city/club?clubId=${m.clubId}`]) {
      assert.ok(cards.includes(part), `card missing ${part}`);
      assert.ok(table.includes(part), `row missing ${part}`);
    }
  }
  assert.equal(count(cards, /Отозвать/g), 2);
  assert.equal(count(table, /Отозвать/g), 2);
  assert.match(html, /<ul class="mt-3 flex flex-col gap-2 md:hidden"/);
  assert.match(html, /hidden overflow-x-auto rounded-3xl border border-border md:block/);
  // Busy state is per assignment, in both layouts.
  const busy = renderToStaticMarkup(createElement(ClubManagersList, { managers: MANAGERS, busyId: "a1", onRevoke: () => {} }));
  assert.equal(count(busy, /disabled=""/g), 2);
});

test("CITY-MANAGERS-LOGIC: assignment/revoke logic is unchanged — the cabinet passes its existing revokeManager", () => {
  const src = read("src/components/control/CityManagerCabinet.tsx");
  assert.match(src, /<ClubManagersList managers=\{dashboard\.clubManagers\} busyId=\{busyId\} onRevoke=\{revokeManager\} \/>/);
});

/* ===================================================================== *
 *  6. Bottom-nav clearance — one shared rule
 * ===================================================================== */

test("CLEARANCE-RULE: clearance = nav offset + bar + raised «Метрик» overhang + gap, ON TOP of the safe-area inset; the class literal encodes exactly that", () => {
  assert.equal(bottomNavClearancePx(), 12 + 66 + 24 + 16);
  assert.equal(BOTTOM_NAV_CLEARANCE_CLASS, `pb-[calc(env(safe-area-inset-bottom)+${bottomNavClearancePx()}px)]`);
  // Stays in sync with the nav's real markup.
  const nav = read("src/components/bottom-navigation.tsx");
  assert.match(nav, new RegExp(`pb-\\[calc\\(env\\(safe-area-inset-bottom\\)\\+${BOTTOM_NAV_GEOMETRY.offsetAboveSafeArea}px\\)\\]`));
  assert.match(nav, /px-1\.5 py-2 /);
  assert.match(nav, /relative -mt-8 flex size-14/);
  // The old 128px did not cover an iPhone (34px inset) nav top of ~131px; the new rule does, with a gap.
  const iphoneInset = 34;
  assert.ok(128 < iphoneInset + 12 + 66 + 19);
  assert.ok(iphoneInset + bottomNavClearancePx() >= iphoneInset + 12 + 66 + 19 + 12);
});

function filesRendering(component: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx") && read(full).includes(`<${component}`)) out.push(full);
    }
  };
  walk("src");
  return out.sort();
}

test("CLEARANCE-COVERAGE: every screen that renders the floating nav uses the shared clearance (no pb-32 / magic numbers), except /metric whose composer reserves more", () => {
  const files = filesRendering("BottomNavigation");
  assert.ok(files.length >= 14);
  for (const f of files) {
    const src = read(f);
    if (f.endsWith(join("app", "metric", "page.tsx"))) {
      assert.match(src, /pb-\[calc\(env\(safe-area-inset-bottom\)\+150px\)\]/);
      continue;
    }
    assert.match(src, /min-h-\[100dvh\] \$\{BOTTOM_NAV_CLEARANCE_CLASS\}/, f);
    assert.doesNotMatch(src, /\bpb-32\b/, f);
  }
  // The management root tabs named in the brief are among them.
  for (const r of ["home", "team", "plan", "academy", "city", "questions", "knowledge", "ranking", "profile"]) {
    assert.ok(files.some((f) => f.endsWith(join("app", r, "page.tsx"))), r);
  }
});

test("CLEARANCE-VIEWAS: the banner is untouched and the clearance is independent of it (it sits at the top; the nav and padding at the bottom)", () => {
  const banner = read("src/components/control/ViewAsBanner.tsx");
  assert.match(banner, /sticky top-0 z-50/);
  assert.doesNotMatch(read("src/lib/bottom-nav-clearance.ts"), /viewContext|ViewAs/);
});
