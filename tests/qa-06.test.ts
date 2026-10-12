import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildControlNav, flattenControlNav, resolveActiveControlNavItem, describeControlNavSelector, type ControlNavFlags } from "../src/lib/control/control-nav";
import {
  AUDIT_ACTION_LABEL,
  LOG_CARD_REFRESH_MS,
  LOG_CARD_WINDOW_MINUTES,
  describeAuditAction,
  describeAuditContext,
  formatLogTime,
} from "../src/lib/control/admin-dashboard";
import { controlAdminApi } from "../src/lib/api/control-admin-client";
import { sanitizeQuestionForActor, type QuestionRecordForSanitize } from "../src/lib/server/questions/questions-core";
import type { ActorContext } from "../src/lib/server/rbac/types";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const NONE: ControlNavFlags = { role: "EMPLOYEE", hasSystemAccess: false, isClubManager: false, isCityManager: false, isOperationsDirector: false };
const labels = (f: ControlNavFlags) => flattenControlNav(buildControlNav(f)).map((i) => i.label);
const hrefs = (f: ControlNavFlags) => flattenControlNav(buildControlNav(f)).map((i) => i.href);

const PROJECT_ADMIN: ControlNavFlags = { ...NONE, role: "ADMIN", hasSystemAccess: true };
const GRANT_ADMIN: ControlNavFlags = { ...NONE, hasSystemAccess: true };
const SPM: ControlNavFlags = { ...NONE, role: "SPM" };
const ADMIN_ONLY = ["Метрик", "Роли", "Логи"];
const CONTENT = ["Обучение", "Скрипты", "Инструкции"];
const RESULTS = ["Тайный покупатель", "Продажи", "Рейтинг сотрудников"];
const CLUB_CABINET = ["Мои клубы", "Управляющий", "План дня"];

/* ===================================================================== *
 *  Navigation by role
 * ===================================================================== */

test("NAV-PA: PROJECT_ADMIN sees the admin-only system sections, content and results — and NOT Мои клубы / Управляющий / План дня", () => {
  const l = labels(PROJECT_ADMIN);
  for (const x of [...ADMIN_ONLY, ...CONTENT, ...RESULTS]) assert.ok(l.includes(x), x);
  for (const x of CLUB_CABINET) assert.ok(!l.includes(x), x);
  assert.deepEqual(
    buildControlNav(PROJECT_ADMIN).map((g) => g.title),
    [null, "Система", "Контент", "Контроль и результаты"],
  );
});

test("NAV-PA-GRANT (updated for QA-06.1): a PROJECT_ADMIN by grant only (no legacy SPM/ADMIN role) gets system, content AND results — the /spm guard is the shared capability now", () => {
  const l = labels(GRANT_ADMIN);
  for (const x of [...ADMIN_ONLY, "Сотрудники", ...CONTENT, ...RESULTS]) assert.ok(l.includes(x), x);
  for (const x of CLUB_CABINET) assert.ok(!l.includes(x), x);
  assert.match(read("src/app/spm/(panel)/layout.tsx"), /if \(!user \|\| !\(await hasSharedControlAccessForUser\(user\)\)\)/);
});

test("NAV-SPM (updated for QA-06.1): SPM sees content and results — never Роли / Логи / Метрик / Сотрудники, never club management", () => {
  assert.deepEqual(labels(SPM), ["Главная", ...CONTENT, ...RESULTS]);
  for (const x of [...ADMIN_ONLY, "Сотрудники", ...CLUB_CABINET]) assert.ok(!labels(SPM).includes(x), x);
  // Content is the shared capability on the server (so it opens for SPM).
  assert.match(read("src/app/admin/layout.tsx"), /hasSharedControlAccessForUser\(user\)/);
  assert.match(read("src/app/control/(portal)/scripts/page.tsx"), /hasSharedControlAccessForUser\(user\)/);
});

test("NAV-CABINETS: CLUB_MANAGER and CITY_MANAGER keep their own cabinets exactly; an admin who REALLY holds those roles gets them too", () => {
  assert.deepEqual(labels({ ...NONE, role: "CLUB_MANAGER" }), ["Главная", "Управляющий", "План дня"]);
  assert.deepEqual(labels({ ...NONE, isClubManager: true }), ["Главная", "Управляющий", "План дня"]);
  assert.deepEqual(labels({ ...NONE, isCityManager: true }), ["Главная", "Мои клубы"]);
  assert.deepEqual(labels({ ...NONE, isOperationsDirector: true }), ["Главная", "Сеть"]);
  assert.ok(labels({ ...PROJECT_ADMIN, isCityManager: true }).includes("Мои клубы"));
  const groups = buildControlNav({ ...NONE, isClubManager: true });
  assert.equal(resolveActiveControlNavItem(groups, "/control/team")?.label, "Управляющий");
});

test("NAV-NO-FAKE-DESTINATIONS (updated for QA-07): no nav item for a feature whose data does not exist yet (Рейтинг клубов); Расходы Метрика / Посещаемость are real since QA-07; every href is a real page", () => {
  const everyone: ControlNavFlags = { role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true };
  const l = labels(everyone);
  assert.ok(!l.includes("Рейтинг клубов"));
  for (const x of ["Расходы Метрика", "Посещаемость"]) assert.ok(l.includes(x), x);
  const toFile = (href: string) =>
    href.startsWith("/control")
      ? `src/app/control/(portal)${href.slice("/control".length)}/page.tsx`
      : href.startsWith("/spm")
        ? `src/app/spm/(panel)${href.slice("/spm".length)}/page.tsx`
        : `src/app${href}/page.tsx`;
  for (const href of hrefs(everyone)) assert.ok(existsSync(toFile(href)), href);
});

test("NAV-ROUTES-KEPT: no route was deleted (club/city/plan/team/users/admin/spm)", () => {
  for (const f of [
    "src/app/control/(portal)/club/page.tsx",
    "src/app/control/(portal)/city/page.tsx",
    "src/app/control/(portal)/plan/page.tsx",
    "src/app/control/(portal)/team/page.tsx",
    "src/app/control/(portal)/users/page.tsx",
    "src/app/admin/page.tsx",
    "src/app/spm/(panel)/page.tsx",
  ]) assert.ok(existsSync(f), f);
});

test("NAV-MOBILE: the closed selector shows only the section — «Логи», «Метрик», «Рейтинг сотрудников»", () => {
  const groups = buildControlNav(PROJECT_ADMIN);
  assert.equal(describeControlNavSelector(groups, "/control/logs").label, "Логи");
  assert.equal(describeControlNavSelector(groups, "/control/metric/documents").label, "Метрик");
  assert.equal(describeControlNavSelector(groups, "/spm/rating").label, "Рейтинг сотрудников");
  assert.match(read("src/app/spm/(panel)/rating/page.tsx"), /<h1 className="text-2xl font-bold">Рейтинг сотрудников<\/h1>/);
});

/* ===================================================================== *
 *  Logs — real UserAuditLog, PROJECT_ADMIN only
 * ===================================================================== */

test("LOGS-GUARD: the logs API and page are PROJECT_ADMIN only and read the existing UserAuditLog (no second logging system)", () => {
  const route = read("src/app/api/control/logs/route.ts");
  assert.match(route, /const user = await requireSystemAccess\(\);/);
  assert.match(route, /await listAuditLog\(user, \{/);
  assert.match(route, /rows: await withAuditNames\(result\.rows\)/);
  assert.match(route, /sinceMinutes: since \? Math\.min\(1440, since\) : undefined/);
  assert.match(read("src/app/control/(portal)/logs/page.tsx"), /if \(!\(await hasSystemAccessForUser\(user\)\)\)/);
  const svc = read("src/lib/server/rbac/audit-service.ts");
  assert.match(svc, /prisma\.userAuditLog\.findMany\(/);
  assert.match(svc, /conditions\.push\(\{ createdAt: \{ gte: new Date\(Date\.now\(\) - filter\.sinceMinutes \* 60_000\) \} \}\);/);
  // Names resolved in ONE query for the page, not per row.
  assert.match(svc, /await prisma\.user\.findMany\(\{ where: \{ id: \{ in: ids \} \}, select: \{ id: true, displayName: true \} \}\)/);
  // The pre-existing scoped audit endpoint is untouched in behaviour.
  assert.match(read("src/app/api/control/audit/route.ts"), /const user = await requireUser\(\);/);
});

test("LOGS-PRESENTATION: readable actions (unknown codes shown as-is), context, and relative time", () => {
  assert.equal(describeAuditAction("ROLE_ASSIGNED"), "Назначена роль");
  assert.equal(describeAuditAction("ACCESS_SUSPENDED"), "Доступ приостановлен");
  assert.equal(describeAuditAction("SOMETHING_NEW"), "SOMETHING_NEW");
  assert.ok(Object.keys(AUDIT_ACTION_LABEL).length >= 10);
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(formatLogTime("2026-10-12T11:59:40Z", now), "только что");
  assert.equal(formatLogTime("2026-10-12T11:57:00Z", now), "3 мин назад");
  assert.match(formatLogTime("2026-10-12T09:00:00Z", now), /^\d{2}:\d{2}$/);
  assert.match(formatLogTime("2026-10-10T09:00:00Z", now), /^\d{2}\.\d{2}, \d{2}:\d{2}$/);
  assert.equal(describeAuditContext({ actorUserId: "a", targetUserId: "b", targetName: "Мария", clubName: "Полтавская", cityName: "НН" }), "Мария · Полтавская");
  assert.equal(describeAuditContext({ actorUserId: "a", targetUserId: "a", targetName: "Я", clubName: null, cityName: "НН" }), "НН");
});

test("LOGS-CARD-QUERY: the Home card asks for the rolling last 5 minutes only", async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ rows: [], page: 1, limit: 10, total: 0 }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const res = await controlAdminApi.logs({ sinceMinutes: LOG_CARD_WINDOW_MINUTES, limit: 10 });
    assert.deepEqual(res.rows, []);
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, ["/api/control/logs?sinceMinutes=5&limit=10"]);
});

test("LOGS-REFRESH: the card refreshes only its own data every 5 minutes (no page reload), stops on unmount, and has the empty state", () => {
  assert.equal(LOG_CARD_WINDOW_MINUTES, 5);
  assert.equal(LOG_CARD_REFRESH_MS, 5 * 60 * 1000);
  const dash = code("src/components/control/ControlDashboard.tsx");
  const card = dash.slice(dash.indexOf("export function RecentLogsCard"), dash.indexOf("function EmployeeQuestionsCard"));
  assert.match(card, /const timer = setInterval\(load, LOG_CARD_REFRESH_MS\);/);
  assert.match(card, /clearInterval\(timer\);/);
  assert.match(card, /controlAdminApi\s*\n?\s*\.logs\(\{ sinceMinutes: LOG_CARD_WINDOW_MINUTES, limit: 10 \}/);
  assert.match(card, /За последние 5 минут действий нет/);
  assert.match(card, /href="\/control\/logs">Все логи/);
  assert.doesNotMatch(dash, /router\.refresh|location\.reload|window\.location/);
});

/* ===================================================================== *
 *  Employee questions card — real data, privacy preserved
 * ===================================================================== */

test("QUESTIONS-CARD: real EmployeeQuestion data via the existing sanitized list, PROJECT_ADMIN only", () => {
  const route = read("src/app/api/control/admin/questions-summary/route.ts");
  assert.match(route, /const user = await requireSystemAccess\(\);/);
  assert.match(route, /listEmployeeQuestionsForActor\(actor, \{ status: "NEW", limit: 5 \}\)/);
  assert.match(route, /listEmployeeQuestionsForActor\(actor, \{ status: "IN_PROGRESS", limit: 1 \}\)/);
  const svc = read("src/lib/server/questions/questions-service.ts");
  assert.match(svc, /questions: rows\.map\(\(r\) => sanitizeQuestionForActor\(actor, toSanitizeInput\(r\)\)\)/);
  const dash = code("src/components/control/ControlDashboard.tsx");
  assert.match(dash, /\{q\.authorDisplay\}/);
  assert.doesNotMatch(dash, /authorUserId/);
  assert.match(dash, /href="\/questions">Все вопросы/);
});

test("QUESTIONS-PRIVACY: the anonymity rule the card relies on is unchanged — operational leaders masked, PROJECT_ADMIN audit exception kept", () => {
  const actor = (o: Partial<ActorContext>): ActorContext => ({ userId: "viewer", appRole: "EMPLOYEE", accessStatus: null, onboardingCompleted: true, employeeClubId: null, grants: [], ...o });
  const rec: QuestionRecordForSanitize = {
    id: "q", category: "IDEA", text: "Идея", anonymous: true, status: "NEW", authorUserId: "author", authorDisplayName: "Ева Губанкова",
    senderRole: "MANAGER", cityNameSnapshot: "НН", clubNameSnapshot: "Полтавская", createdAt: new Date(), updatedAt: new Date(), attachments: [],
  };
  const cm = actor({ grants: [{ id: "g", role: "CITY_MANAGER", scopeType: "CITY", cityId: "nn", clubId: null, status: "ACTIVE" }] });
  assert.equal(sanitizeQuestionForActor(cm, rec).authorDisplay, "Анонимный сотрудник");
  assert.equal(sanitizeQuestionForActor(actor({ grants: [{ id: "p", role: "PROJECT_ADMIN", scopeType: "SYSTEM", cityId: null, clubId: null, status: "ACTIVE" }] }), rec).authorDisplay, "Ева Губанкова");
});

/* ===================================================================== *
 *  Home — admin vs SPM, and no fabricated numbers
 * ===================================================================== */

test("HOME-ROLES: PROJECT_ADMIN gets the real-data cards; SPM and every other role get the header only — nothing admin-only is requested for them", () => {
  const dash = code("src/components/control/ControlDashboard.tsx");
  assert.match(dash, /\{hasSystemAccess && \(\s*\n\s*<div className="mt-6 grid[^"]*">\s*\n\s*<RecentLogsCard \/>\s*\n\s*<EmployeeQuestionsCard \/>\s*\n\s*<LearningCard \/>/);
  // The admin cards mount (and fetch) only inside that branch.
  assert.equal((dash.match(/<RecentLogsCard \/>/g) ?? []).length, 1);
  assert.equal((dash.match(/<EmployeeQuestionsCard \/>/g) ?? []).length, 1);
});

test("HOME-NO-FAKE-DATA (updated for QA-07): Control Home shows no invented numbers — telemetry lives in TelemetryCards and reads only the recorded QA-07 events; no club ranking", () => {
  const dash = code("src/components/control/ControlDashboard.tsx");
  // The QA-06 cards themselves still carry no cost/token/visit numbers…
  assert.doesNotMatch(dash, /Расход|токен|Посещаем|Частые вопросы|Рейтинг клубов|cost|tokens|pageview/i);
  // …the telemetry section is a separate component, fed by the real APIs.
  assert.match(dash, /\{hasSystemAccess && <TelemetrySection \/>\}/);
  const cards = code("src/components/control/TelemetryCards.tsx");
  assert.match(cards, /controlAdminApi\.metricUsage/);
  assert.match(cards, /controlAdminApi\.metricQuestions/);
  assert.match(cards, /controlAdminApi\.visits/);
  assert.doesNotMatch(cards, /Рейтинг клубов/);
  // MetricMessage still carries no usage fields: usage lives in its own events table.
  const schema = read("prisma/schema.prisma");
  const metricMessage = schema.slice(schema.indexOf("model MetricMessage {"), schema.indexOf("}", schema.indexOf("model MetricMessage {")));
  const fields = metricMessage.split("\n").filter((l) => /^\s+\w+\s+\w/.test(l) && !l.trim().startsWith("///")).map((l) => l.trim().split(/\s+/)[0]);
  assert.ok(fields.includes("content") && fields.includes("openaiResponseId"));
  for (const f of fields) assert.doesNotMatch(f, /token|cost|usage|^model$/i, f);
  assert.match(schema, /model MetricUsageEvent \{/);
  assert.match(schema, /model PageViewEvent \{/);
  assert.doesNotMatch(schema, /model ClubRating/);
});
