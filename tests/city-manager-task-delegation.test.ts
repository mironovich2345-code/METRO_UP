import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cityManagerAssignTaskSchema } from "../src/lib/server/club-plan-schemas";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skip = { skip: "integration: requires Postgres + running server" } as const;

/**
 * Management Round E2 — CITY_MANAGER -> CLUB_MANAGER Daily Plan delegation
 * (src/lib/server/city-plan.ts, GET/POST /api/control/cabinet/city-manager/
 * club-task-status|assign-task, src/app/city/club/page.tsx's "Задачи"
 * section + AssignTaskSheet). Pure schema validation gets real, DB-free
 * coverage below; every DB-backed authorization/date/audit scenario
 * section 17 asks for is an explicit skip stub, matching this repo's
 * established convention (no Postgres fixture installed).
 */

/* ===================================================================== *
 *  cityManagerAssignTaskSchema — pure (sections 6/7)
 * ===================================================================== */

test("SCHEMA-A: a valid {clubId, date, title} body parses successfully", () => {
  const r = cityManagerAssignTaskSchema.safeParse({ clubId: "club-1", date: "2026-06-01", title: "Проверить кассу" });
  assert.equal(r.success, true);
});

test("SCHEMA-B: a malformed date (not YYYY-MM-DD) is rejected", () => {
  assert.equal(cityManagerAssignTaskSchema.safeParse({ clubId: "club-1", date: "01.06.2026", title: "Задача" }).success, false);
  assert.equal(cityManagerAssignTaskSchema.safeParse({ clubId: "club-1", date: "2026-6-1", title: "Задача" }).success, false);
});

test("SCHEMA-C: an empty or whitespace-only title is rejected", () => {
  assert.equal(cityManagerAssignTaskSchema.safeParse({ clubId: "club-1", date: "2026-06-01", title: "" }).success, false);
  assert.equal(cityManagerAssignTaskSchema.safeParse({ clubId: "club-1", date: "2026-06-01", title: "   " }).success, false);
});

test("SECURITY-SCHEMA-A: the schema has NO userId/createdByUserId/source field at all — even if a client POSTs extra JSON garbage pretending to be one, Zod's own parse() strips every field not declared on this schema, so the service never even SEES them", () => {
  const parsed = cityManagerAssignTaskSchema.parse({
    clubId: "club-1",
    date: "2026-06-01",
    title: "Задача",
    userId: "evil-user-id",
    createdByUserId: "evil-actor-id",
    source: "ADMIN",
    targetUserId: "evil-target",
  });
  assert.deepEqual(Object.keys(parsed).sort(), ["clubId", "date", "title"]);
});

/* ===================================================================== *
 *  city-plan.ts — structural/wiring (sections 7/9/10/12)
 * ===================================================================== */

function cityPlanSrc(): string {
  return read("src/lib/server/city-plan.ts");
}

function createFnSrc(): string {
  const src = cityPlanSrc();
  return src.slice(src.indexOf("export async function createCityManagerTaskForClubManager"), src.indexOf("/**\n * Section 11"));
}

test("AUTH-ORDER-A: the caller's own ACTIVE CITY_MANAGER grant is checked FIRST, before any club/date/text validation — a non-CITY_MANAGER caller never reaches far enough to learn anything about club scope or dates", () => {
  const fnSrc = createFnSrc();
  const roleCheckIdx = fnSrc.indexOf('hasActiveRole(cityActor.grants, "CITY_MANAGER")');
  const clubCheckIdx = fnSrc.indexOf("cityIdForClub(input.clubId)");
  const dateCheckIdx = fnSrc.indexOf("appDay().getTime()");
  assert.ok(roleCheckIdx > 0 && roleCheckIdx < clubCheckIdx && roleCheckIdx < dateCheckIdx);
});

test("PASTDATE-A: a requested date strictly before appDay() (business-timezone today) is rejected — the exact comparison, never a UTC/device-local one", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /if \(date\.getTime\(\) < appDay\(\)\.getTime\(\)\) \{/);
  assert.match(fnSrc, /"past_date", "Нельзя назначить задачу на прошедшую дату"/);
});

test("TIMEZONE-A: city-plan.ts imports appDay from the SAME ./time module daily-plan.ts's own materialization already uses — no second, parallel date/timezone concept", () => {
  const src = cityPlanSrc();
  assert.match(src, /import \{ appDay \} from "\.\/time";/);
  const dailyPlanSrc = read("src/lib/server/daily-plan.ts");
  assert.match(dailyPlanSrc, /import \{ appDay, appMonthYear \} from "\.\/time";/);
});

test("SCOPE-A: the target club's authorization reuses the existing, generic club.read predicate (authorize-core.ts) — the SAME one /city/club's own dashboard read already uses — never a new, parallel scope rule; targetClubCityId is independently re-derived from the DB (cityIdForClub), never trusted from client input (there is no cityId field on the request at all)", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /const targetClubCityId = await cityIdForClub\(input\.clubId\);/);
  assert.match(fnSrc, /authorize\(cityActor, \{ action: "club\.read", targetClubId: input\.clubId, targetClubCityId \}\)/);
});

test("NOINPUT-A: AssignCityManagerTaskInput has exactly clubId/date/title — no userId, createdByUserId, or source field exists on the TYPE itself, so the service cannot accept one even if a future caller tried", () => {
  const src = cityPlanSrc();
  const ifaceSrc = src.slice(src.indexOf("export interface AssignCityManagerTaskInput"), src.indexOf("/**\n * Section 9"));
  assert.match(ifaceSrc, /clubId: string;/);
  assert.match(ifaceSrc, /date: string;/);
  assert.match(ifaceSrc, /title: string;/);
  assert.doesNotMatch(ifaceSrc, /userId|createdByUserId|source/);
});

test("DATA-A: createdByUserId is always the REAL actor's own id, never anything client-supplied — the literal write uses actor.id, the function's own parameter, not any field read off `input`", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /createdByUserId: actor\.id,/);
  assert.doesNotMatch(fnSrc, /createdByUserId: input\./);
});

test("SOURCE-A: source is the EXISTING DailyTaskSource.MANAGER value, reused — no new enum value invented this round", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /source: "MANAGER",/);
});

test("TARGET-A: the target userId is NEVER read from the request — it comes only from resolveActiveClubManagerForClub's own server-side resolution of the (now-authorized) clubId", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /const manager = await resolveActiveClubManagerForClub\(input\.clubId\);/);
  assert.match(fnSrc, /userId: manager\.userId,/);
});

test("AUDIT-A: a DAILY_TASK_ASSIGNED UserAuditLog row is written with safe metadata only — opaque taskId + the task date, never the task's own text", () => {
  const fnSrc = createFnSrc();
  assert.match(fnSrc, /action: "DAILY_TASK_ASSIGNED",/);
  assert.match(fnSrc, /metadata: \{ taskId: created\.id, date: input\.date \},/);
  assert.doesNotMatch(fnSrc, /metadata: \{[^}]*title/);
});

test("LEGACY-A: resolveActiveClubManagerForClub checks BOTH identity sources this cabinet already treats as equally valid — an ACTIVE CLUB_MANAGER RoleAssignment grant for the exact club, OR the legacy AppRole=CLUB_MANAGER + EmployeeProfile.clubId convention — never only one", () => {
  const src = cityPlanSrc();
  const fnSrc = src.slice(src.indexOf("export async function resolveActiveClubManagerForClub"), src.indexOf("/**\n * Section 7"));
  assert.match(fnSrc, /role: "CLUB_MANAGER", status: "ACTIVE", clubId/);
  assert.match(fnSrc, /role: "CLUB_MANAGER", employeeProfile: \{ clubId \}/);
});

test("NOMATERIALIZE-A: getClubManagerTaskStatus never calls getPlanTodayFor/getPlanToday/ensureTodayTasks/materializeDailyPlan — a plain count query only, no materialization side effect from a CITY_MANAGER merely glancing at a status summary", () => {
  const src = cityPlanSrc();
  const fnSrc = src.slice(src.indexOf("export async function getClubManagerTaskStatus"), src.length);
  assert.doesNotMatch(fnSrc, /getPlanTodayFor|getPlanToday\(|ensureTodayTasks|materializeDailyPlan/);
  assert.match(fnSrc, /prisma\.dailyTask\.findMany\(\{ where: \{ userId: manager\.userId, date: appDay\(\) \}, select: \{ status: true \} \}\)/);
});

/* ===================================================================== *
 *  GET /api/plan/today — the ONE read path, unchanged (section 10)
 * ===================================================================== */

test("READPATH-A: getPlanToday's own DailyTask query has no source/templateId/clubTaskTemplateId filter at all — a delegated one-off task (no template, source=MANAGER) is picked up automatically, exactly like every other task kind; no second 'tasks assigned by city manager' read API was built", () => {
  const src = read("src/lib/server/daily-plan.ts");
  const fnSrc = src.slice(src.indexOf("export async function getPlanToday"), src.indexOf("export async function getPlanToday") + 2000);
  assert.match(fnSrc, /prisma\.dailyTask\.findMany\(\{\s*\n\s*where: \{ userId: user\.id, date \},/);
});

/* ===================================================================== *
 *  Route wiring (sections 7/8/13)
 * ===================================================================== */

test("ROUTE-ASSIGN-A: the POST route delegates entirely to createCityManagerTaskForClubManager after Zod-validating the body — no inline auth/role check duplicated or bypassed in the route itself", () => {
  const src = read("src/app/api/control/cabinet/city-manager/assign-task/route.ts");
  assert.match(src, /const body = cityManagerAssignTaskSchema\.parse\(await readJson\(req\)\);/);
  assert.match(src, /const result = await createCityManagerTaskForClubManager\(user, body\);/);
  assert.doesNotMatch(src, /hasActiveRole|authorize\(/);
});

test("ROUTE-STATUS-A: the GET status route independently re-validates BOTH the CITY_MANAGER role AND club.read scope before calling the service — a read endpoint is not exempt from the same scope check the write endpoint makes", () => {
  const src = read("src/app/api/control/cabinet/city-manager/club-task-status/route.ts");
  assert.match(src, /hasActiveRole\(actor\.grants, "CITY_MANAGER"\)/);
  assert.match(src, /authorize\(actor, \{ action: "club\.read", targetClubId: clubId, targetClubCityId \}\)/);
});

test("VIEWAS-MIDDLEWARE-A: src/middleware.ts's matcher (/api/:path*) covers the new POST assign-task route — the SAME blanket 'any active MANAGER/CLUB_MANAGER persona preview blocks every mutating method' guard this whole app already relies on, with no route-specific opt-out added for this feature", () => {
  const middlewareSrc = read("src/middleware.ts");
  assert.match(middlewareSrc, /matcher: \["\/api\/:path\*"\]/);
  assert.match(middlewareSrc, /const MUTATING_METHODS = new Set\(\["POST", "PUT", "PATCH", "DELETE"\]\);/);
  const routeSrc = read("src/app/api/control/cabinet/city-manager/assign-task/route.ts");
  assert.match(routeSrc, /export async function POST\(/);
  // No bespoke allowlist entry was added for this route — it is not exempt.
  assert.doesNotMatch(middlewareSrc, /city-manager\/assign-task/);
});

/* ===================================================================== *
 *  Client wiring (sections 6/14)
 * ===================================================================== */

test("CLIENT-A: assignCityManagerTask's request body type is exactly {clubId, date, title} — the client-side function signature itself has no room for a userId/createdByUserId/source parameter", () => {
  const src = read("src/lib/api/cabinet-client.ts");
  const fnSrc = src.slice(src.indexOf("assignCityManagerTask:"), src.indexOf("clubManagerTaskStatus:"));
  assert.match(fnSrc, /body: \{ clubId: string; date: string; title: string \}/);
  assert.doesNotMatch(fnSrc, /userId|createdByUserId|source/);
});

test("CACHE-A: a successful assignment invalidates ONLY the city-club-task-status query (reloadTaskStatus) — no invalidatePrefix call for Academy/Ranking/Profile, no full page reload", () => {
  const src = read("src/app/city/club/page.tsx");
  const onAssignedIdx = src.indexOf("onAssigned={() => {\n            setAssigningTask(false);");
  assert.ok(onAssignedIdx > 0);
  const block = src.slice(onAssignedIdx, onAssignedIdx + 250);
  assert.match(block, /reloadTaskStatus\(\);/);
  assert.doesNotMatch(block, /invalidatePrefix|location\.reload/);
});

/* ===================================================================== *
 *  UI wiring (sections 5/6/15/16)
 * ===================================================================== */

test("UI-A: the 'Задачи' row is rendered ONLY when taskStatus is non-null — a club with no active manager shows no assign-task entry point at all", () => {
  const src = read("src/app/city/club/page.tsx");
  assert.match(src, /\{taskStatus && \(\s*\n\s*<motion\.div variants=\{cardIn\}>\s*\n\s*<GlassCard variant="solid" pad="none" animateIn=\{false\}>\s*\n\s*<ManagementListRow\s*\n\s*icon=\{ListChecks\}\s*\n\s*title="Задачи"/);
});

test("UI-B: the compact status subtitle never shows a meaningless 0 — the zero-task case renders the honest 'Сегодня задач нет', only a non-zero total shows counts", () => {
  const src = read("src/app/city/club/page.tsx");
  const fnSrc = src.slice(src.indexOf('title="Задачи"'), src.indexOf('title="Задачи"') + 500);
  assert.match(fnSrc, /taskStatus\.today\.total > 0/);
  assert.match(fnSrc, /Сегодня задач нет/);
});

test("UI-C: AssignTaskSheet's submit call sends only clubId/date/title — the manager/club NAME shown in the sheet are read-only display props, never part of the request body", () => {
  const src = read("src/app/city/club/page.tsx");
  const fnSrc = src.slice(src.indexOf("function AssignTaskSheet"), src.length);
  assert.match(fnSrc, /await cabinetApi\.assignCityManagerTask\(\{ clubId, date, title: title\.trim\(\) \}\);/);
});

test("UI-D: the date input's default AND its native min= both come from the business-timezone helper (appDateString, src/lib/app-day.ts) — never a device-local `Date`, which would silently disagree with the server's own appDay() for a manager outside Moscow", () => {
  const src = read("src/app/city/club/page.tsx");
  assert.match(src, /import \{ appDateString \} from "@\/lib\/app-day";/);
  assert.match(src, /function businessTodayInputValue\(\): string \{\s*\n\s*return appDateString\(\);\s*\n\s*\}/);
  assert.match(src, /min=\{businessTodayInputValue\(\)\}/);
});

test("UI-E: the sheet's primary CTA is disabled while busy or while the task text is empty — cannot submit an empty task from the client either, defense-in-depth on top of the server's own empty_task check", () => {
  const src = read("src/app/city/club/page.tsx");
  const fnSrc = src.slice(src.indexOf("function AssignTaskSheet"), src.length);
  assert.match(fnSrc, /disabled=\{busy \|\| !title\.trim\(\)\}/);
});

test("UI-F: a VIEW_AS_READ_ONLY failure shows the same 'end preview and retry' affordance AssignManagerSheet already offers — consistent UX, no new error-handling pattern invented for this one sheet", () => {
  const src = read("src/app/city/club/page.tsx");
  const fnSrc = src.slice(src.indexOf("function AssignTaskSheet"), src.length);
  assert.match(fnSrc, /errCode === "VIEW_AS_READ_ONLY"/);
  assert.match(fnSrc, /Завершить предпросмотр/);
});

/* ===================================================================== *
 *  AUTH — DB-backed (section 17) — skip stubs
 * ===================================================================== */

test("E2-AUTH-A: a real CITY_MANAGER with a CITY-scope grant assigns a task to the active CLUB_MANAGER of a club inside that city — 200, task created for the manager's own userId", skip, () => {});
test("E2-AUTH-B: a CITY_MANAGER with only a CLUB-scope point-exception grant for ONE specific club can assign to that club's manager, but not to any other club in the same city", skip, () => {});
test("E2-AUTH-C: a foreign club (outside the caller's scope entirely) is rejected with 403, never 404 — the caller should not learn whether the club even exists beyond what club.read already reveals", skip, () => {});
test("E2-AUTH-D: a revoked/suspended CITY_MANAGER grant is rejected immediately — hasActiveRole is re-derived fresh on every call, never cached", skip, () => {});
test("E2-AUTH-E: a club whose active CLUB_MANAGER was just revoked (no active grant, no legacy role) returns the honest no_manager 404, never a stale/cached assignment", skip, () => {});
test("E2-AUTH-F: a plain MANAGER (no CITY_MANAGER grant) gets 403 from this endpoint", skip, () => {});
test("E2-AUTH-G: a real CLUB_MANAGER (no CITY_MANAGER grant of their own) gets 403 from this endpoint — delegation is CITY_MANAGER-only this round", skip, () => {});

/* --------------------------- LEGACY (section 17) --------------------------- */

test("E2-LEGACY-A: a club whose active manager exists ONLY via the legacy AppRole=CLUB_MANAGER + EmployeeProfile.clubId convention (no RoleAssignment row) is still a valid assignment target", skip, () => {});
test("E2-LEGACY-B: a DIFFERENT club's legacy manager is never matched — resolveActiveClubManagerForClub's legacy branch filters by the exact clubId, never a network-wide legacy lookup", skip, () => {});

/* ---------------------------- DATE (section 17) ---------------------------- */

test("E2-DATE-A: today (business-timezone) is allowed", skip, () => {});
test("E2-DATE-B: a future date is allowed", skip, () => {});
test("E2-DATE-C: yesterday (business-timezone) is rejected with past_date, never silently clamped to today", skip, () => {});

/* ---------------------------- DATA (section 17) ---------------------------- */

test("E2-DATA-A: the created DailyTask's createdByUserId equals the real actor's id, verified against the DB row, not just the response payload", skip, () => {});
test("E2-DATA-B: the created task appears in the target CLUB_MANAGER's own GET /api/plan/today response for that date, with no second read path involved", skip, () => {});

/* ---------------------------- AUDIT (section 17) ---------------------------- */

test("E2-AUDIT-A: a DAILY_TASK_ASSIGNED UserAuditLog row exists after a successful assignment, with actorUserId/targetUserId/clubId matching the request and metadata containing only taskId+date", skip, () => {});

/* --------------------------- VIEW AS (section 17) --------------------------- */

test("E2-VIEWAS-A: while a MANAGER/CLUB_MANAGER View-As preview is active for the CITY_MANAGER's own session, POST assign-task is rejected with VIEW_AS_READ_ONLY by the global middleware, before the route handler (and thus createCityManagerTaskForClubManager) ever runs", skip, () => {});

/* ------------------------- STATUS READ (section 17) ------------------------- */

test("E2-STATUS-A: a CITY_MANAGER can read the in-scope target manager's today total/completed counts via club-task-status", skip, () => {});
test("E2-STATUS-B: the SAME endpoint for a club outside scope 403s — status is never visible for a foreign manager", skip, () => {});
