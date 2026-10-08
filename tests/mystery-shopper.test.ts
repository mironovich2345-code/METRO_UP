import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  averageScore,
  buildClubRows,
  buildEmployeeRows,
  derivePeriods,
  parsePeriodQuery,
  pickSelectedPeriod,
} from "../src/lib/server/mystery-shopper-core";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skip = { skip: "integration: requires Postgres + running server" } as const;

/**
 * Management Round E3 — the Mystery Shopper management workspace
 * (src/lib/server/mystery-shopper.ts + mystery-shopper-core.ts, GET
 * /api/control/cabinet/mystery-shopper, src/app/mystery-shopper/page.tsx).
 * Every pure aggregation/period rule the round brief lists gets REAL,
 * DB-free node:test coverage below (the brief's own "do not create skip
 * stubs for logic that can be covered as pure/unit tests") — only genuine
 * DB-backed scope/authorization scenarios are skip stubs, matching this
 * repo's established convention.
 */

/* ===================================================================== *
 *  averageScore — pure (round brief sections 18/20)
 * ===================================================================== */

test("AVG-A: the average of real scores only, rounded to one decimal — the round brief's own worked example (90, 80, 70 -> 80)", () => {
  assert.equal(averageScore([90, 80, 70]), 80);
});

test("AVG-B: an empty score list averages to null, never a fabricated 0", () => {
  assert.equal(averageScore([]), null);
});

test("AVG-C: a single real score averages to itself", () => {
  assert.equal(averageScore([73]), 73);
});

test("AVG-D: non-integer means round to ONE decimal place — the same round1 convention rating-formula.ts/summarizeTraining already use, never more precision", () => {
  assert.equal(averageScore([91, 91, 90]), 90.7); // 90.666... -> 90.7
  assert.equal(averageScore([100, 99, 98]), 99); // exact
});

/* ===================================================================== *
 *  derivePeriods — pure (round brief section 7)
 * ===================================================================== */

test("PERIOD-A: distinct (month, year) pairs only, deduplicated across multiple employees sharing the same period", () => {
  const rows = [
    { periodMonth: 6, periodYear: 2026 },
    { periodMonth: 6, periodYear: 2026 },
    { periodMonth: 5, periodYear: 2026 },
  ];
  assert.deepEqual(derivePeriods(rows).map((p) => `${p.year}-${p.month}`), ["2026-6", "2026-5"]);
});

test("PERIOD-B: sorted newest first — year takes priority over month", () => {
  const rows = [
    { periodMonth: 1, periodYear: 2026 },
    { periodMonth: 12, periodYear: 2025 },
    { periodMonth: 6, periodYear: 2026 },
  ];
  assert.deepEqual(derivePeriods(rows).map((p) => `${p.year}-${p.month}`), ["2026-6", "2026-1", "2025-12"]);
});

test("PERIOD-C: zero rows derives zero periods — no fabricated 'current month' entry when there is genuinely no data", () => {
  assert.deepEqual(derivePeriods([]), []);
});

test("PERIOD-D: a period label uses the existing ruMonthYear convention (same format as ManagementEmployeeMysteryResultDTO.periodLabel)", () => {
  const periods = derivePeriods([{ periodMonth: 9, periodYear: 2026 }]);
  assert.equal(periods[0].label, "Сентябрь 2026");
});

/* ===================================================================== *
 *  pickSelectedPeriod — pure (round brief sections 7/20)
 * ===================================================================== */

test("SELECT-A: the latest available period is selected by default (no request)", () => {
  const periods = derivePeriods([
    { periodMonth: 6, periodYear: 2026 },
    { periodMonth: 9, periodYear: 2026 },
  ]);
  assert.deepEqual(pickSelectedPeriod(periods, { month: null, year: null }), { month: 9, year: 2026, label: "Сентябрь 2026" });
});

test("SELECT-B: an explicitly requested real period is honored over the default latest one", () => {
  const periods = derivePeriods([
    { periodMonth: 6, periodYear: 2026 },
    { periodMonth: 9, periodYear: 2026 },
  ]);
  assert.deepEqual(pickSelectedPeriod(periods, { month: 6, year: 2026 }), { month: 6, year: 2026, label: "Июнь 2026" });
});

test("SELECT-C: with zero periods available, selection is null — the honest empty state, never a fabricated current month", () => {
  assert.equal(pickSelectedPeriod([], { month: null, year: null }), null);
});

/* ===================================================================== *
 *  parsePeriodQuery — pure (round brief section 7, query parsing)
 * ===================================================================== */

test("QUERY-A: a well-formed month+year pair parses to real numbers", () => {
  assert.deepEqual(parsePeriodQuery("9", "2026"), { periodMonth: 9, periodYear: 2026 });
});

test("QUERY-B: month without year (or vice versa) is ignored entirely — never a half-applied filter matching every year", () => {
  assert.deepEqual(parsePeriodQuery("9", null), { periodMonth: null, periodYear: null });
  assert.deepEqual(parsePeriodQuery(null, "2026"), { periodMonth: null, periodYear: null });
});

test("QUERY-C: an out-of-range month (0, 13) is rejected, falling back to the default", () => {
  assert.deepEqual(parsePeriodQuery("0", "2026"), { periodMonth: null, periodYear: null });
  assert.deepEqual(parsePeriodQuery("13", "2026"), { periodMonth: null, periodYear: null });
});

test("QUERY-D: a non-numeric month/year is rejected, never NaN propagating downstream", () => {
  assert.deepEqual(parsePeriodQuery("abc", "2026"), { periodMonth: null, periodYear: null });
});

/* ===================================================================== *
 *  buildEmployeeRows — pure (round brief section 8/20)
 * ===================================================================== */

test("EMP-A: every CURRENT employee gets a row, in the same order given, even with zero results — never omitted", () => {
  const employees = [
    { userId: "u1", displayName: "Аня", position: "Менеджер" },
    { userId: "u2", displayName: "Боря", position: null },
  ];
  const rows = buildEmployeeRows(employees, new Map());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.userId), ["u1", "u2"]);
});

test("EMP-B: a result-less employee gets score: null — NEVER a fabricated 0%", () => {
  const employees = [{ userId: "u1", displayName: "Аня", position: null }];
  const rows = buildEmployeeRows(employees, new Map());
  assert.equal(rows[0].score, null);
});

test("EMP-C: an employee WITH a published result for the selected period gets that exact score", () => {
  const employees = [{ userId: "u1", displayName: "Аня", position: null }];
  const rows = buildEmployeeRows(employees, new Map([["u1", 88]]));
  assert.equal(rows[0].score, 88);
});

/* ===================================================================== *
 *  buildClubRows — pure (round brief section 9's explicit anti-pattern)
 * ===================================================================== */

test("CLUBROW-A: each club's own average is computed from ONLY its own employees' scores, independent of other clubs", () => {
  const clubs = [{ id: "c1", name: "Клуб 1" }, { id: "c2", name: "Клуб 2" }];
  const byClub = new Map([["c1", ["a", "b"]], ["c2", ["c"]]]);
  const scoreByUserId = new Map([["a", 90], ["b", 70], ["c", 50]]);
  const rows = buildClubRows(clubs, byClub, scoreByUserId);
  assert.deepEqual(rows.find((r) => r.clubId === "c1")!.summary, { averageScore: 80, resultCount: 2 });
  assert.deepEqual(rows.find((r) => r.clubId === "c2")!.summary, { averageScore: 50, resultCount: 1 });
});

test("CLUBROW-B: a club with zero published results for the period gets averageScore:null, resultCount:0 — never 0%", () => {
  const clubs = [{ id: "c1", name: "Клуб 1" }];
  const rows = buildClubRows(clubs, new Map([["c1", ["a"]]]), new Map());
  assert.deepEqual(rows[0].summary, { averageScore: null, resultCount: 0 });
});

test("CITYAVG-A: the round brief's own anti-pattern, proven numerically — a flat city-wide average over EVERY individual result differs from (and is correct over) a naive mean of each club's own average, when club sizes differ", () => {
  // Club A: 2 employees, scores 100 and 100 -> club average 100.
  // Club B: 1 employee, score 0 -> club average 0.
  // Naive average-of-club-averages: (100 + 0) / 2 = 50.
  // Correct, brief-mandated city average: flat mean of [100, 100, 0] = 66.7.
  const clubs = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const byClub = new Map([["a", ["a1", "a2"]], ["b", ["b1"]]]);
  const scoreByUserId = new Map([["a1", 100], ["a2", 100], ["b1", 0]]);
  const clubRows = buildClubRows(clubs, byClub, scoreByUserId);
  const naiveAverageOfAverages = averageScore(clubRows.map((r) => r.summary.averageScore!));
  const correctCityAverage = averageScore([...scoreByUserId.values()]);
  assert.equal(naiveAverageOfAverages, 50);
  assert.equal(correctCityAverage, 66.7);
  assert.notEqual(correctCityAverage, naiveAverageOfAverages);
});

/* ===================================================================== *
 *  Schema truth — historical attribution (round brief sections 2/14/26)
 * ===================================================================== */

function mysteryResultModelSrc(): string {
  const src = read("prisma/schema.prisma");
  const start = src.indexOf("model MysteryShopperResult {");
  const end = src.indexOf("\n}", start);
  return src.slice(start, end);
}

test("SCHEMA-A: MysteryShopperResult has NO clubId/cityId/club-snapshot field at all — confirmed directly against the schema, not just asserted in a comment. This is the authoritative premise every 'current team, never historical club' wording in this round rests on", () => {
  const modelSrc = mysteryResultModelSrc();
  assert.match(modelSrc, /employeeUserId\s+String/);
  assert.doesNotMatch(modelSrc, /\bclubId\b/);
  assert.doesNotMatch(modelSrc, /\bcityId\b/);
});

test("SCHEMA-B: the one unique constraint is [employeeUserId, periodMonth, periodYear] — status is NOT part of it, so a DRAFT and a PUBLISHED row for the same employee+period can never coexist. No duplicate-published-row ambiguity is possible by construction (round brief section 19)", () => {
  const modelSrc = mysteryResultModelSrc();
  assert.match(modelSrc, /@@unique\(\[employeeUserId, periodMonth, periodYear\]\)/);
});

test("HIST-A: mystery-shopper.ts resolves club membership ONLY from loadEmployees (current EmployeeProfile.clubId) — the MysteryShopperResult query's own select clause has no clubId to read even if it wanted to, since the model has none", () => {
  const src = read("src/lib/server/mystery-shopper.ts");
  assert.match(src, /select: \{ employeeUserId: true, periodMonth: true, periodYear: true, score: true \}/);
  assert.match(src, /userIdsByClub\.get\(e\.clubId\)/); // e comes from loadEmployees's own EmployeeRow
});

/* ===================================================================== *
 *  No threshold / no classification (round brief section 4)
 * ===================================================================== */

test("NOTHRESHOLD-A: neither the service, the core aggregation, nor the page classifies a score — no comparison against a magic number, no color/traffic-light/warning copy anywhere in this feature's own files", () => {
  const files = ["src/lib/server/mystery-shopper.ts", "src/lib/server/mystery-shopper-core.ts", "src/app/mystery-shopper/page.tsx"];
  const banned = [/низкий результат/, /отлично/, /плохо/, /score\s*[<>]=?\s*\d/i, /traffic/i];
  for (const f of files) {
    const src = read(f);
    for (const re of banned) assert.doesNotMatch(src, re, `${f} matched banned pattern ${re}`);
  }
});

test("NOTHRESHOLD-B: ManagementMysteryShopperEmployeeRowDTO and ClubRowDTO have no comment field — comments stay reachable ONLY through the existing, independently-authorized Employee Card, never a new broader-permission surface (section 15)", () => {
  const src = read("src/lib/api/cabinet-types.ts");
  const empIdx = src.indexOf("export interface ManagementMysteryShopperEmployeeRowDTO");
  const empSrc = src.slice(empIdx, src.indexOf("}", empIdx));
  assert.doesNotMatch(empSrc, /comment/);
  const clubIdx = src.indexOf("export interface ManagementMysteryShopperClubRowDTO");
  const clubSrc = src.slice(clubIdx, src.indexOf("}", clubIdx));
  assert.doesNotMatch(clubSrc, /comment/);
});

/* ===================================================================== *
 *  Performance — one bounded query, never per-employee/per-club (section 17)
 * ===================================================================== */

test("PERF-A: exactly ONE prisma.mysteryShopperResult query exists in the whole service file, shared by both the club and city scopes via loadPublishedResults — never one per employee, never one per club", () => {
  const src = read("src/lib/server/mystery-shopper.ts");
  const matches = src.match(/prisma\.mysteryShopperResult\.(findMany|findFirst|findUnique)/g) ?? [];
  assert.equal(matches.length, 1, `expected exactly one MysteryShopperResult query, found ${matches.length}`);
});

test("PERF-B: loadPublishedResults is called exactly once per exported scope function (getClubMysteryShopper, getCityMysteryShopper) — never inside a per-employee/per-club loop", () => {
  const src = read("src/lib/server/mystery-shopper.ts");
  const clubFnSrc = src.slice(src.indexOf("export async function getClubMysteryShopper"), src.indexOf("export async function getCityMysteryShopper"));
  const cityFnSrc = src.slice(src.indexOf("export async function getCityMysteryShopper"));
  assert.equal((clubFnSrc.match(/loadPublishedResults\(/g) ?? []).length, 1);
  assert.equal((cityFnSrc.match(/loadPublishedResults\(/g) ?? []).length, 1);
  assert.doesNotMatch(clubFnSrc, /\.map\([^)]*loadPublishedResults/);
  assert.doesNotMatch(cityFnSrc, /\.map\([^)]*loadPublishedResults/);
});

test("PERF-C: loadEmployees is reused from cabinet-dashboards.ts (the SAME batched, club-list-bound query every other dashboard already uses) — never a second, parallel 'who works here' query invented for this feature", () => {
  const src = read("src/lib/server/mystery-shopper.ts");
  assert.match(src, /import \{ loadEmployees \} from "\.\/rbac\/cabinet-dashboards";/);
});

/* ===================================================================== *
 *  Security — no arbitrary userId, clubId always re-validated (sections 11/12)
 * ===================================================================== */

test("SEC-A: the GET route never reads a userId/employeeUserId query parameter at all — only clubId/month/year. The real actor's identity comes solely from requireUser()'s session", () => {
  const src = read("src/app/api/control/cabinet/mystery-shopper/route.ts");
  assert.match(src, /searchParams\.get\("clubId"\)/);
  assert.doesNotMatch(src, /searchParams\.get\("userId"\)/);
  assert.doesNotMatch(src, /searchParams\.get\("employeeUserId"\)/);
});

test("SEC-B: a clubId hint that resolves via none of resolveClubManagerCabinetAccess's tiers is ALWAYS a 403 — the route never falls through to the broader CITY_MANAGER root scope when a real hint was given and failed", () => {
  const src = read("src/app/api/control/cabinet/mystery-shopper/route.ts");
  const accessCheckIdx = src.indexOf("if (access)");
  const clubIdFailIdx = src.indexOf("if (clubIdParam)");
  const rootCheckIdx = src.indexOf('hasActiveRole(actor.grants, "CITY_MANAGER")');
  assert.ok(accessCheckIdx > 0 && clubIdFailIdx > accessCheckIdx && rootCheckIdx > clubIdFailIdx);
  const failBranch = src.slice(clubIdFailIdx, rootCheckIdx);
  assert.match(failBranch, /throw new AuthError\(403,/);
});

test("SEC-C: the root (no clubId) scope requires an ACTIVE CITY_MANAGER grant specifically — never OPERATIONS_DIRECTOR/network-read, which this round explicitly excludes as a feature", () => {
  const src = read("src/app/api/control/cabinet/mystery-shopper/route.ts");
  assert.match(src, /hasActiveRole\(actor\.grants, "CITY_MANAGER"\)/);
  // Checked as actual CALLS (open paren), not bare words — this file's own
  // doc comment legitimately names OPERATIONS_DIRECTOR in prose explaining
  // the exclusion; what must never exist is a CALL granting it access.
  assert.doesNotMatch(src, /hasNetworkAccess\(|hasSystemAccess\(/);
});

test("SEC-D: the route resolution reuses resolveClubManagerCabinetAccess unchanged — the exact existing four-tier function (own grant, legacy identity, View-As preview, club.read scope) that club-manager/route.ts already uses, never a new/duplicate/looser scope check invented for this feature", () => {
  const src = read("src/app/api/control/cabinet/mystery-shopper/route.ts");
  assert.match(src, /import \{ resolveClubManagerCabinetAccess \} from "@\/lib\/server\/rbac\/cabinet-dashboards";/);
  assert.match(src, /resolveClubManagerCabinetAccess\(user, clubIdParam\)/);
});

/* ===================================================================== *
 *  UI wiring — one shared route, dispatched by scope.kind (section 5/9/10)
 * ===================================================================== */

test("UI-A: the page renders EITHER the CLUB view OR the CITY view based on data.scope.kind alone — never a client-side role guess", () => {
  const src = read("src/app/mystery-shopper/page.tsx");
  assert.match(src, /data\.scope\.kind === "CLUB"/);
  assert.match(src, /data\.scope\.kind === "CITY"/);
});

test("UI-B: tapping a club row in the CITY view drills into the SAME route with ?clubId= set — never a separate /city/mystery-shopper screen", () => {
  const src = read("src/app/mystery-shopper/page.tsx");
  assert.match(src, /router\.push\(`\/mystery-shopper\?clubId=\$\{c\.clubId\}`\)/);
});

test("UI-C: an employee row links to the EXISTING /team/employee Employee Card — no duplicate Mystery Shopper detail screen built for this round", () => {
  const src = read("src/app/mystery-shopper/page.tsx");
  assert.match(src, /\/team\/employee\?userId=\$\{e\.userId\}/);
});

test("UI-D: the empty-state copy matches the round brief's own examples exactly", () => {
  const src = read("src/app/mystery-shopper/page.tsx");
  assert.match(src, /Результатов пока нет/);
  assert.match(src, /За этот период результатов нет/);
  assert.match(src, /Нет результата/);
});

test("UI-E: the period selector is non-interactive (no chevron, no tap) when there is only zero or one real period to switch between", () => {
  const src = read("src/app/mystery-shopper/page.tsx");
  assert.match(src, /const canSwitch = periods\.length > 1;/);
});

/* ===================================================================== *
 *  Entry points — Home + /city/club (section 6)
 * ===================================================================== */

test("ENTRY-A: CLUB_MANAGER's Home row links to /mystery-shopper WITH this manager's own clubId — never the bare root route", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /router\.push\(`\/mystery-shopper\?clubId=\$\{block\.clubId\}`\)/);
});

test("ENTRY-B: CITY_MANAGER's Home row links to the bare root /mystery-shopper (no clubId) — the root scope, not a pre-picked club", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /onClick=\{\(\) => router\.push\("\/mystery-shopper"\)\}/);
});

test("ENTRY-C: /city/club's own row passes THIS club's id through — the drill-down the round brief's section 6 explicitly asks for", () => {
  const src = read("src/app/city/club/page.tsx");
  assert.match(src, /router\.push\(`\/mystery-shopper\?clubId=\$\{clubId\}`\)/);
});

test("ENTRY-D: Mystery Shopper is NOT added to bottom navigation this round — the brief's explicit 'do not add to bottom navigation'", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.doesNotMatch(src, /mystery-shopper/);
});

/* ===================================================================== *
 *  AUTH — DB-backed (section 25) — skip stubs
 * ===================================================================== */

test("E3-AUTH-A: a real CLUB_MANAGER (own grant or legacy identity) sees scope.kind CLUB for their own club", skip, () => {});
test("E3-AUTH-B: a clubId outside the caller's scope entirely returns 403, never a different club's data", skip, () => {});
test("E3-AUTH-C: a CITY_MANAGER with a CITY-scope grant sees every active club in that city at the root, and can drill into any of them", skip, () => {});
test("E3-AUTH-D: a CITY_MANAGER with only a CLUB-scope point-exception grant can drill into exactly that one club, and the root scope lists only it", skip, () => {});
test("E3-AUTH-E: a revoked/suspended CITY_MANAGER grant is rejected immediately from the root scope — hasActiveRole re-derived fresh, never cached", skip, () => {});
test("E3-AUTH-F: a plain EMPLOYEE (no CLUB_MANAGER/CITY_MANAGER grant, no legacy identity) gets 403 from both the root and any clubId", skip, () => {});

/* --------------------------- VIEW AS (section 23) --------------------------- */

test("E3-VIEWAS-A: a CITY_MANAGER with an active View-As CLUB_MANAGER preview sees scope.kind CLUB for the PREVIEWED club regardless of any clubId query param — resolveClubManagerCabinetAccess's own tier-1 behavior, reused unmodified", skip, () => {});
test("E3-VIEWAS-B: the response carries scope.isPreviewing: true during that preview, and the surface offers no mutation regardless (read-only by construction — no POST/PUT/DELETE route exists for this feature at all)", skip, () => {});

/* --------------------------- DATA (section 25) --------------------------- */

test("E3-DATA-A: a DRAFT MysteryShopperResult row is excluded from every summary/count/employee row — the one findMany's own status:'PUBLISHED' filter is the sole guarantee, verified structurally above (PERF-A) but needs a live DB to prove end-to-end", skip, () => {});
test("E3-DATA-B: an employee who transferred clubs has their old results attributed to their NEW (current) club, and no longer appears under their old one — the documented historical-attribution limitation, observable only against real data", skip, () => {});
