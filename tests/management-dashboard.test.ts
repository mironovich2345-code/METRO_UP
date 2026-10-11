import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HOME_TERRITORY_CLUB_LIMIT,
  attentionClubNames,
  cityOverview,
  listNames,
  managementGreeting,
  managementIdentity,
  pendingEmployeeNames,
  summarizeToday,
  territoryClubs,
} from "../src/lib/management-home";
import { getInitials } from "../src/lib/utils";
import type { HomeAttentionItemDTO } from "../src/lib/api/home-types";

/**
 * Sprint: LIVE QA QA-03 — "Management Dashboard Visual Polish". This is a
 * visual round, so the tests here are deliberately few: REAL tests of the
 * pure derivations that decide what the CLUB_MANAGER / CITY_MANAGER
 * dashboards may show (src/lib/management-home.ts — the "never invent a
 * number" rule lives there), plus a handful of supplementary source checks
 * for the guarantees a pure function cannot see (no hardcoded metric in the
 * markup, empty states, QA-01B motion, one View-As dashboard). Section order
 * and routes are pinned in tests/management-nav.test.ts (updated for QA-03).
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
/** Drop comments so prose never satisfies (or fails) a code assertion. */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const task = (title: string, status: "TODO" | "COMPLETED" | "SKIPPED", mode: "auto" | "manual" | "blocked" = "manual") => ({
  title,
  status,
  mode,
});

const attention = (
  category: HomeAttentionItemDTO["category"],
  entityName: string,
  clubId: string | null,
): HomeAttentionItemDTO => ({ category, entityId: `${category}:${entityName}`, entityName, clubId });

/* ============================== today (CLUB_MANAGER) ============================== */

test("MDB-A: a zero-task day is its own explicit state — no '0 из 0', no ratio, nothing to draw a 0% bar from (the audited empty-plan rule)", () => {
  assert.deepEqual(summarizeToday({ total: 0, completed: 0, tasks: [] }), { kind: "empty" });
});

test("MDB-B: a day with tasks passes the plan's REAL completed/total through; 'Далее' is the first open, actionable task the DTO carries — never a completed, skipped or blocked one, and null (never guessed) when none of the carried tasks is open", () => {
  const summary = summarizeToday({
    total: 9,
    completed: 3,
    tasks: [task("Сверить кассу", "COMPLETED"), task("Пересменка", "TODO", "blocked"), task("Провести планёрку", "TODO")],
  });
  assert.deepEqual(summary, { kind: "tasks", completed: 3, total: 9, ratio: 3 / 9, allDone: false, nextTaskTitle: "Провести планёрку" });

  // The server only sends the first tasks — when none of THOSE is open, the
  // card shows no next task rather than inventing one.
  const unknownNext = summarizeToday({ total: 9, completed: 3, tasks: [task("A", "COMPLETED"), task("B", "SKIPPED")] });
  assert.equal(unknownNext.kind === "tasks" && unknownNext.nextTaskTitle, null);
});

test("MDB-C: a finished day is 'Все задачи выполнены' — full ratio, no next task", () => {
  assert.deepEqual(summarizeToday({ total: 4, completed: 4, tasks: [task("A", "COMPLETED")] }), {
    kind: "tasks",
    completed: 4,
    total: 4,
    ratio: 1,
    allDone: true,
    nextTaskTitle: null,
  });
});

/* ============================== territory (CITY_MANAGER) ============================== */

test("MDB-D: the territory overview passes the block's OWN numbers through; training is null whenever the DTO has no average (no block, or a null average) — while a GENUINE 0% stays the number 0; a scope with no clubs gets no overview at all (a sentence, never '0 клубов / 0 сотрудников')", () => {
  const training = { totalPublishedLessons: 24, averageProgressPercent: 32.5, employeesCompletedAll: 3 };
  assert.deepEqual(cityOverview({ clubCount: 5, employeeCount: 48, training }), {
    clubCount: 5,
    employeeCount: 48,
    training: { averagePercent: 32.5, completedAll: 3 },
  });
  assert.equal(cityOverview({ clubCount: 1, employeeCount: 0, training: null })?.training, null);
  assert.equal(cityOverview({ clubCount: 1, employeeCount: 4, training: { ...training, averageProgressPercent: null } })?.training, null);
  assert.deepEqual(cityOverview({ clubCount: 2, employeeCount: 9, training: { ...training, averageProgressPercent: 0, employeesCompletedAll: 0 } })?.training, {
    averagePercent: 0,
    completedAll: 0,
  });
  assert.equal(cityOverview({ clubCount: 0, employeeCount: 0, training: null }), null);
});

test("MDB-E: Home's club list keeps the server's order (no re-ranking) and caps at HOME_TERRITORY_CLUB_LIMIT — six, the largest single city in the network — reporting exactly how many are left for /city", () => {
  assert.equal(HOME_TERRITORY_CLUB_LIMIT, 6);
  const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
  assert.deepEqual(territoryClubs(eight), { visible: ["a", "b", "c", "d", "e", "f"], hiddenCount: 2 });
  assert.deepEqual(territoryClubs(["z", "a"]), { visible: ["z", "a"], hiddenCount: 0 });
  assert.deepEqual(territoryClubs([]), { visible: [], hiddenCount: 0 });
});

test("MDB-F: WHERE for a CITY_MANAGER attention row — a no-manager item names its club; a pending item names an EMPLOYEE, so its club comes from the block's own club list by clubId; names are deduplicated in server order, and an id the list doesn't know is skipped, never shown raw", () => {
  const block = {
    clubs: [
      { clubId: "c1", clubName: "Амундсена", employeeCount: 3, managerName: null, attentionCount: 3, trainingCompletionPercent: null },
      { clubId: "c2", clubName: "Крауля", employeeCount: 2, managerName: "Ольга", attentionCount: 1, trainingCompletionPercent: 10 },
    ],
    attention: [
      attention("CLUB_WITHOUT_CLUB_MANAGER", "Амундсена", "c1"),
      attention("PENDING_EMPLOYEE_APPROVAL", "Анна", "c2"),
      attention("PENDING_EMPLOYEE_APPROVAL", "Олег", "c1"),
      attention("PENDING_EMPLOYEE_APPROVAL", "Вера", "c2"),
      attention("PENDING_EMPLOYEE_APPROVAL", "Ник", "unknown-club"),
    ],
  };
  assert.deepEqual(attentionClubNames(block, "CLUB_WITHOUT_CLUB_MANAGER"), ["Амундсена"]);
  assert.deepEqual(attentionClubNames(block, "PENDING_EMPLOYEE_APPROVAL"), ["Крауля", "Амундсена"]);
});

test("MDB-G: WHO for the CLUB_MANAGER pending row is the waiting employees' real names (pending items only, deduplicated); listNames joins them, and an empty list is null so the row renders no empty WHERE line", () => {
  const items = [
    attention("PENDING_EMPLOYEE_APPROVAL", "Анна Кузнецова", "c"),
    attention("PENDING_EMPLOYEE_APPROVAL", "Анна Кузнецова", "c"),
    attention("PENDING_EMPLOYEE_APPROVAL", "Дмитрий Соколов", "c"),
    attention("CLUB_WITHOUT_CLUB_MANAGER", "Клуб", "c"),
  ];
  assert.deepEqual(pendingEmployeeNames(items), ["Анна Кузнецова", "Дмитрий Соколов"]);
  assert.equal(listNames(pendingEmployeeNames(items)), "Анна Кузнецова, Дмитрий Соколов");
  assert.equal(listNames([]), null);
});

/* ============================== identity / View-As ============================== */

test("MDB-H: the management header is 'greeting, name' + role + scope — a View-As persona preview (synthetic 'Управляющий (просмотр)') gets the bare greeting, a CITY_MANAGER self-preview (the real actor) keeps the name, a scope with no clubs gets no scope title (never the server's bare plural word), and PERSONAL/onboarding get null (their header is untouched)", () => {
  const cityNameForClub = (clubId: string) => (clubId === "nizhny-novgorod-poltavskaya-30" ? "Нижний Новгород" : null);
  const club = { kind: "club_manager" as const, block: { clubId: "nizhny-novgorod-poltavskaya-30", clubLabel: "Полтавская", isPreviewing: false } };

  assert.deepEqual(managementIdentity(club, { greeting: "Добрый день", firstName: "Иван", cityNameForClub }), {
    roleLabel: "Управляющий",
    greeting: "Добрый день, Иван",
    scopeTitle: "Полтавская",
    scopeMeta: "Нижний Новгород",
  });
  const preview = managementIdentity({ ...club, block: { ...club.block, isPreviewing: true } }, { greeting: "Добрый день", firstName: "Управляющий", cityNameForClub });
  assert.equal(preview?.greeting, "Добрый день");
  assert.equal(preview?.scopeTitle, "Полтавская", "a preview shows the SAME club scope as the real dashboard");

  const city = { kind: "city_manager" as const, block: { scopeLabel: "Екатеринбург", clubCount: 5 } };
  assert.deepEqual(managementIdentity(city, { greeting: "Доброе утро", firstName: "Мария", cityNameForClub }), {
    roleLabel: "Ст. города",
    greeting: "Доброе утро, Мария",
    scopeTitle: "Екатеринбург",
    scopeMeta: null,
  });
  assert.equal(managementIdentity({ kind: "city_manager", block: { scopeLabel: "клубов", clubCount: 0 } }, { greeting: "Добрый день", firstName: "Мария", cityNameForClub })?.scopeTitle, null);

  for (const kind of ["full", "onboarding"] as const) {
    assert.equal(managementIdentity({ kind }, { greeting: "Добрый день", firstName: "Иван", cityNameForClub }), null);
  }
  assert.equal(managementGreeting("Добрый вечер", "  ", false), "Добрый вечер");
});

test("MDB-I: avatar initials only count words that start with a letter — the View-As persona avatar is 'У', never 'У('; real names are unchanged", () => {
  assert.equal(getInitials("Управляющий (просмотр)"), "У");
  assert.equal(getInitials("Иван Петров"), "ИП");
  assert.equal(getInitials("Анна"), "А");
  assert.equal(getInitials("Анна-Мария Ли"), "АЛ");
  assert.equal(getInitials("Ivan O'Brien"), "IO");
});

/* ============================== supplementary source checks ============================== */

test("MDB-S1 (structural): no hardcoded metric anywhere in the dashboard markup — the presentational components and both Home sections render no numeric literal as a value (no '32%', '5 клубов', '0 из 9'); every number is a prop/DTO expression", () => {
  const homeSrc = read("src/app/home/page.tsx");
  const sections = homeSrc.slice(homeSrc.indexOf("function CityManagerHomeSection"));
  for (const [name, src] of [
    ["management-dashboard.tsx", read("src/components/management/management-dashboard.tsx")],
    ["home management sections", sections],
  ] as const) {
    const code = codeOnly(src);
    // `из\s`, not `из\b`: without the u flag \b never matches after Cyrillic.
    assert.doesNotMatch(code, /[>"'`]\s*\d+(?:[.,]\d+)?\s*(?:%|из\s|клуб|сотрудник|задач|вопрос)/, `${name}: a literal metric`);
  }
});

test("MDB-S2 (structural): the audited empty states remain — a zero-task day renders 'На сегодня задач нет' with no progress bar in that branch; no clubs / no training average are sentences; an empty attention list is still ManagementEmptyState", () => {
  const ui = read("src/components/management/management-dashboard.tsx");
  const today = ui.slice(ui.indexOf("export function TodayCard"), ui.indexOf("export function TeamSummaryCard"));
  const emptyBranch = today.slice(today.indexOf('summary.kind === "empty" ? ('), today.indexOf(") : (", today.indexOf('summary.kind === "empty" ? (')));
  assert.match(emptyBranch, /На сегодня задач нет/);
  assert.doesNotMatch(emptyBranch, /XPProgress|summary\.total/);
  assert.match(ui, /В вашей зоне пока нет клубов/);
  assert.match(ui, /Данных по обучению пока нет/);
  assert.doesNotMatch(codeOnly(ui), /"—"/);

  const primitives = read("src/components/management/management-primitives.tsx");
  const attentionSection = primitives.slice(primitives.indexOf("export function AttentionSection"), primitives.indexOf("function AttentionListRow"));
  assert.match(attentionSection, /items\.length === 0 \? \(\s*\n\s*<ManagementEmptyState \/>/);
});

test("MDB-S3 (structural, QA-01B): the dashboard components declare no entrance of their own — no `initial` prop anywhere — and every progress bar paints at its value (animateIn={false}) instead of refilling on each cached Home visit; Home's sections keep animating only through the root stagger (variants={cardIn})", () => {
  const ui = codeOnly(read("src/components/management/management-dashboard.tsx"));
  assert.doesNotMatch(ui, /\binitial=/);
  const bars = ui.match(/<XPProgress[\s\S]*?\/>/g) ?? [];
  assert.ok(bars.length >= 2);
  for (const bar of bars) assert.match(bar, /animateIn=\{false\}/);

  const homeSrc = read("src/app/home/page.tsx");
  const sections = codeOnly(homeSrc.slice(homeSrc.indexOf("function CityManagerHomeSection")));
  assert.doesNotMatch(sections, /\binitial=/);
  assert.match(read("src/components/ui/xp-progress.tsx"), /initial=\{animateIn \? \{ width: 0 \} : false\}/);
});

test("MDB-S4 (structural): a View-As-CLUB_MANAGER preview renders the SAME dashboard — ClubManagerHomeSection has no preview branch of its own (the only preview-aware piece is the header greeting, via managementIdentity)", () => {
  const homeSrc = read("src/app/home/page.tsx");
  const clubSection = codeOnly(homeSrc.slice(homeSrc.indexOf("function ClubManagerHomeSection")));
  assert.doesNotMatch(clubSection, /isPreviewing|viewContext|previewRole/);
});
