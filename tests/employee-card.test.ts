import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aggregateQuizAttempts, type RawQuizAttempt } from "../src/lib/server/rbac/employee-card-core";
import { formatTenureRu, pluralRu } from "../src/lib/cabinet-ui";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Management Round E1 — the ONE shared management Employee Card
 * (ManagementEmployeeCardDTO, src/lib/server/rbac/employee-card.ts +
 * employee-card-core.ts, GET /api/control/cabinet/employee-training,
 * /team/employee/page.tsx). Pure logic (aggregateQuizAttempts,
 * formatTenureRu) gets real, DB-free coverage below, matching this repo's
 * established convention; the DB-backed authorization scenarios (section
 * 19's AUTH list) are explicit skip stubs, same convention Round E0's own
 * TEAM-E0-A/B used.
 */

/* ===================================================================== *
 *  aggregateQuizAttempts — pure (section 8/9)
 * ===================================================================== */

function attempt(overrides: Partial<RawQuizAttempt> = {}): RawQuizAttempt {
  return { quizId: "quiz-1", scorePercent: 80, passed: true, startedAt: new Date("2026-01-01T00:00:00Z"), completedAt: null, ...overrides };
}

test("AGGQUIZ-A: a single attempt for one quiz — latest and best are both that attempt's score, attemptCount=1", () => {
  const out = aggregateQuizAttempts([attempt({ scorePercent: 72, passed: false })], new Map([["quiz-1", "Правила клуба"]]));
  assert.deepEqual(out, [
    { quizId: "quiz-1", title: "Правила клуба", passed: false, latestPercent: 72, bestPercent: 72, lastAttemptAt: "2026-01-01T00:00:00.000Z", attemptCount: 1 },
  ]);
});

test("AGGQUIZ-B: multiple attempts for the SAME quiz — latest is the FIRST in the (already startedAt-desc-ordered) input, best is MAX(scorePercent) across all, attemptCount counts every attempt", () => {
  const attempts = [
    attempt({ scorePercent: 60, passed: false, startedAt: new Date("2026-03-01T00:00:00Z") }), // most recent — fed first, per the caller's orderBy: desc
    attempt({ scorePercent: 95, passed: true, startedAt: new Date("2026-02-01T00:00:00Z") }), // best score, but NOT latest
    attempt({ scorePercent: 70, passed: true, startedAt: new Date("2026-01-01T00:00:00Z") }),
  ];
  const out = aggregateQuizAttempts(attempts, new Map([["quiz-1", "Безопасность"]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].latestPercent, 60);
  assert.equal(out[0].passed, false); // reflects the LATEST attempt, not the best one
  assert.equal(out[0].bestPercent, 95);
  assert.equal(out[0].attemptCount, 3);
  assert.equal(out[0].lastAttemptAt, "2026-03-01T00:00:00.000Z");
});

test("AGGQUIZ-C: attempts across several DISTINCT quizzes are aggregated independently — one output row per quiz, never merged", () => {
  const attempts = [
    attempt({ quizId: "quiz-A", scorePercent: 90 }),
    attempt({ quizId: "quiz-B", scorePercent: 40 }),
    attempt({ quizId: "quiz-A", scorePercent: 85, startedAt: new Date("2025-12-01T00:00:00Z") }),
  ];
  const out = aggregateQuizAttempts(attempts, new Map([["quiz-A", "A"], ["quiz-B", "B"]]));
  assert.equal(out.length, 2);
  const byId = new Map(out.map((r) => [r.quizId, r]));
  assert.equal(byId.get("quiz-A")?.attemptCount, 2);
  assert.equal(byId.get("quiz-B")?.attemptCount, 1);
});

test("AGGQUIZ-D: zero attempts in -> empty array out, never a crash", () => {
  assert.deepEqual(aggregateQuizAttempts([], new Map()), []);
});

test("AGGQUIZ-E: a quizId missing from titleById falls back to an honest em-dash, never a crash or a fabricated title", () => {
  const out = aggregateQuizAttempts([attempt({ quizId: "quiz-orphan" })], new Map());
  assert.equal(out[0].title, "—");
});

test("AGGQUIZ-F: lastAttemptAt prefers completedAt when present, falls back to startedAt only when the attempt was never completed", () => {
  const completed = aggregateQuizAttempts(
    [attempt({ quizId: "q1", startedAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T00:10:00Z") })],
    new Map(),
  );
  assert.equal(completed[0].lastAttemptAt, "2026-01-01T00:10:00.000Z");

  const neverCompleted = aggregateQuizAttempts(
    [attempt({ quizId: "q2", startedAt: new Date("2026-01-01T00:00:00Z"), completedAt: null })],
    new Map(),
  );
  assert.equal(neverCompleted[0].lastAttemptAt, "2026-01-01T00:00:00.000Z");
});

test("AGGQUIZ-G: never reads/returns anything beyond the four scalar fields RawQuizAttempt declares — the input type itself has no room for `answers` or QuizOption.isCorrect, so this function cannot leak them even by accident", () => {
  const src = read("src/lib/server/rbac/employee-card-core.ts");
  assert.doesNotMatch(src, /\banswers\b|isCorrect|QuizOption/);
});

/* ===================================================================== *
 *  formatTenureRu — pure (section 6)
 * ===================================================================== */

test("TENURE-A: under 30 days renders as days, correctly pluralized", () => {
  const now = new Date("2026-01-10T00:00:00Z");
  assert.equal(formatTenureRu("2026-01-09T00:00:00Z", now), "1 день");
  assert.equal(formatTenureRu("2026-01-07T00:00:00Z", now), "3 дня");
  assert.equal(formatTenureRu("2026-01-01T00:00:00Z", now), "9 дней");
});

test("TENURE-B: 30-364 days renders as months only, correctly pluralized", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.equal(formatTenureRu("2026-05-01T00:00:00Z", now), "1 месяц");
  assert.equal(formatTenureRu("2026-03-15T00:00:00Z", now), "2 месяца");
});

test("TENURE-C: an exact whole number of years with zero remaining months never appends '0 месяцев'", () => {
  const now = new Date("2028-01-01T00:00:00Z");
  const label = formatTenureRu("2026-01-01T00:00:00Z", now);
  assert.match(label, /^2 года$/);
});

test("TENURE-D: years plus a non-zero remainder renders both parts, e.g. '2 года 3 месяца'", () => {
  const now = new Date("2028-04-05T00:00:00Z");
  const label = formatTenureRu("2026-01-01T00:00:00Z", now);
  assert.match(label, /^2 года \d+ месяц(а|ев)?$/);
});

test("TENURE-E: a startedAt in the future (clock skew) clamps to zero days, never a negative tenure", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(formatTenureRu("2026-06-01T00:00:00Z", now), `0 ${pluralRu(0, "день", "дня", "дней")}`);
});

/* ===================================================================== *
 *  DTO — no phone field anywhere (section 5)
 * ===================================================================== */

test("NOPHONE-A: the new Round E1 DTOs (ManagementEmployeeProfileDTO and friends) never mention phone in any form — no field, no comment implying one is coming this round", () => {
  const src = read("src/lib/api/cabinet-types.ts");
  const e1Section = src.slice(src.indexOf("Management Round E1"));
  assert.doesNotMatch(e1Section, /phone/i);
});

test("NOPHONE-B: the service composing the card never reads/writes a phone field, and the UI never renders one", () => {
  assert.doesNotMatch(read("src/lib/server/rbac/employee-card.ts"), /phone/i);
  assert.doesNotMatch(read("src/app/team/employee/page.tsx"), /phone/i);
});

/* ===================================================================== *
 *  Employment — never User.createdAt (section 6)
 * ===================================================================== */

test("EMPLOYMENT-A: the employment field is sourced ONLY from a real, OPEN EmploymentAssignment row (endedAt: null) — createdAt never appears anywhere in employee-card.ts (not even in prose — reworded specifically so this check stays meaningful)", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  assert.doesNotMatch(src, /createdAt/);
  assert.match(src, /prisma\.employmentAssignment\.findFirst\(\{\s*\n\s*where: \{ userId: targetUserId, endedAt: null \}/);
});

test("EMPLOYMENT-B: the client hides the employment row entirely when startedAt is null — no '0 дней' / fabricated date fallback", () => {
  const src = read("src/app/team/employee/page.tsx");
  assert.match(src, /\{employment\.startedAt && \(/);
  assert.doesNotMatch(src, /0 дней|дата начала работы не указана/i);
});

/* ===================================================================== *
 *  Tests — no correct-answer leak, no per-quiz N+1 (section 8/12)
 * ===================================================================== */

test("NOLEAK-A: the QuizAttempt select clause never includes the raw `answers` JSON column", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  const fnSrc = src.slice(src.indexOf("async function getEmployeeTestSummaries"), src.indexOf("async function loadPublishedMysteryResults"));
  assert.match(fnSrc, /select: \{ quizId: true, scorePercent: true, passed: true, startedAt: true, completedAt: true \}/);
  assert.doesNotMatch(fnSrc, /answers: true/);
});

test("NOLEAK-B: the Quiz lookup selects only id/title — never joins into QuizQuestion/QuizOption, so isCorrect can never reach this response", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  assert.match(src, /prisma\.quiz\.findMany\(\{ where: \{ id: \{ in: quizIds \} \}, select: \{ id: true, title: true \} \}\)/);
});

test("PERF-A: getEmployeeTestSummaries issues exactly two Prisma calls total (one QuizAttempt.findMany, one Quiz.findMany) regardless of how many quizzes the employee attempted — never one query per quiz", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  const fnSrc = src.slice(src.indexOf("async function getEmployeeTestSummaries"), src.indexOf("async function loadPublishedMysteryResults"));
  const prismaCalls = fnSrc.match(/await prisma\./g) ?? [];
  assert.equal(prismaCalls.length, 2);
  assert.doesNotMatch(fnSrc, /for \(|\.map\(.*await|forEach/);
});

/* ===================================================================== *
 *  Mystery Shopper — PUBLISHED only, no threshold (section 10/12)
 * ===================================================================== */

test("MYSTERY-PUBLISHED-A: the Mystery Shopper query filters status: \"PUBLISHED\" literally — a DRAFT result can never reach this DTO", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  assert.match(src, /where: \{ employeeUserId, status: "PUBLISHED" \}/);
});

test("PERF-B: loadPublishedMysteryResults issues exactly one Prisma call regardless of how many PUBLISHED periods exist — never one query per period", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  const fnSrc = src.slice(src.indexOf("async function loadPublishedMysteryResults"), src.length);
  const prismaCalls = fnSrc.match(/await prisma\./g) ?? [];
  assert.equal(prismaCalls.length, 1);
});

test("MYSTERY-NOTHRESHOLD-A: the Mystery Shopper UI never classifies a score as good/bad — no conditional color/threshold based on result.score anywhere in the employee page", () => {
  const src = read("src/app/team/employee/page.tsx");
  const fnSrc = src.slice(src.indexOf("function MysteryRow"), src.length);
  assert.doesNotMatch(fnSrc, /result\.score\s*[<>]=?\s*\d|score\s*[<>]=?\s*\d/);
});

/* ===================================================================== *
 *  Learning — reused, honest (section 7)
 * ===================================================================== */

test("LEARNING-A: learning reuses getEmployeeTrainingDetail unchanged — overall/programs destructured from its real return, never re-implemented", () => {
  const src = read("src/lib/server/rbac/employee-card.ts");
  assert.match(src, /getEmployeeTrainingDetail\(targetUserId\)/);
  assert.match(src, /learning: \{ overall: trainingDetail\.overall, programs: trainingDetail\.programs \}/);
});

test("LEARNING-B: no fabricated due-date/overdue/mandatory concept introduced anywhere in the new card service or UI", () => {
  assert.doesNotMatch(read("src/lib/server/rbac/employee-card.ts"), /overdue|due date|mandatory/i);
  assert.doesNotMatch(read("src/app/team/employee/page.tsx"), /overdue|due date|mandatory/i);
});

/* ===================================================================== *
 *  Route wiring — E0's auth fix preserved, now serving the richer card
 * ===================================================================== */

test("ROUTE-A: the route now composes the fuller ManagementEmployeeCardDTO via getManagementEmployeeCard, not the old thin getEmployeeTrainingDetail directly", () => {
  const src = read("src/app/api/control/cabinet/employee-training/route.ts");
  assert.match(src, /import \{ getManagementEmployeeCard \} from "@\/lib\/server\/rbac\/employee-card";/);
  assert.match(src, /return jsonOk\(await getManagementEmployeeCard\(targetUserId, target\)\);/);
});

/**
 * Sprint: REMEDIATION R2, F-04 — Round E0's legacy-identity fix
 * (isOwnLegacyClub, asserted here before this round) was replaced, not
 * layered on top of, by resolveClubManagerCabinetAccess +
 * cabinetAccessCoversClub (cabinet-dashboards.ts / scope-core.ts) — the
 * SAME 4-tier resolver already proven by the other /control/cabinet
 * routes, whose tier 2 covers the exact legacy-identity case this test
 * used to assert inline. See tests/cabinet-dashboards.test.ts's
 * CABACCESS-A/B/C (real pure tests) and TEAM-E0-WIRE (updated structural
 * check) for the current coverage of this fix.
 */
test("ROUTE-B: the route still selects cityId/positionId for the new profile fields, alongside the SAME clubId resolveClubManagerCabinetAccess is given, and now resolves authorization through that shared helper instead of a parallel inline legacy-identity check", () => {
  const src = read("src/app/api/control/cabinet/employee-training/route.ts");
  assert.match(src, /select: \{ clubId: true, cityId: true, positionId: true \}/);
  assert.match(src, /resolveClubManagerCabinetAccess\(user, target\.clubId\)/);
  assert.match(src, /cabinetAccessCoversClub\(access, target\.clubId\)/);
  assert.doesNotMatch(src, /isOwnLegacyClub/);
});

/* ===================================================================== *
 *  AUTH — DB-backed, Round E1-specific (section 2/19) — skip stubs
 * ===================================================================== */

test(
  "EMPCARD-AUTH-A: a real CLUB_MANAGER requesting the richer employee card for an employee in their OWN managed club gets 200 with the full ManagementEmployeeCardDTO",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EMPCARD-AUTH-B: the SAME CLUB_MANAGER requesting an employee from a DIFFERENT club still 403s — resolveClubManagerCabinetAccess's tier 2 (legacy)/tier 3 (grant) are both scoped to the actor's own club, exactly as Round E0 left them, now resolved via the shared helper (Sprint: REMEDIATION R2, F-04)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EMPCARD-AUTH-C: a CITY_MANAGER requesting an employee's card inside their effective scope (a club in a city they're granted) gets 200",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EMPCARD-AUTH-D: the SAME CITY_MANAGER requesting an employee in a city OUTSIDE their scope still 403s — club.read's own grantCoversClub re-derives the target club's real city independently every time, never trusts a client-supplied cityId",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EMPCARD-AUTH-E: a revoked/suspended CITY_MANAGER or CLUB_MANAGER grant denies access to this endpoint the moment it's no longer ACTIVE — getActorContext is never cached, re-derived fresh on every request",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "EMPCARD-AUTH-F: Sprint: REMEDIATION R2.1 — a real CITY_MANAGER with scope covering clubs A and B, previewing as View-As MANAGER of club A, gets 403 for EITHER club's employee card — isManagerPersonaPreview denies before the real actor's own club.read authority is ever consulted. The pure decision logic is real-tested (cabinet-dashboards.test.ts's MGRPERSONA-A..F); this names the full HTTP-level claim",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

/* ===================================================================== *
 *  UI composition (section 4/14/15)
 * ===================================================================== */

test("UI-A: the page renders ProfileSummaryCard, then Обучение, Тесты, Тайный покупатель sections in that exact order", () => {
  const src = read("src/app/team/employee/page.tsx");
  const iProfile = src.indexOf("<ProfileSummaryCard");
  const iLearning = src.indexOf(">Обучение</p>");
  const iTests = src.indexOf(">Тесты</p>");
  const iMystery = src.indexOf(">Тайный покупатель</p>");
  for (const i of [iProfile, iLearning, iTests, iMystery]) assert.ok(i >= 0);
  assert.ok(iProfile < iLearning && iLearning < iTests && iTests < iMystery);
});

test("UI-B: Tests section's empty state is the honest 'Не проходил', not a fabricated zero row", () => {
  const src = read("src/app/team/employee/page.tsx");
  const fnSrc = src.slice(src.indexOf("function TestsSection"), src.indexOf("/* --------------------------- MYSTERY SHOPPER"));
  assert.match(fnSrc, /tests\.length === 0/);
  assert.match(fnSrc, /Не проходил/);
});

test("UI-C: Mystery section's empty state is the honest 'Нет результатов'", () => {
  const src = read("src/app/team/employee/page.tsx");
  const fnSrc = src.slice(src.indexOf("function MysterySection"), src.indexOf("function MysteryRow"));
  assert.match(fnSrc, /mystery\.history\.length === 0/);
  assert.match(fnSrc, /Нет результатов/);
});

test("UI-D: the avatar renders from profile.avatarUrl via the shared Avatar component (initials fallback built in) — never a raw storageKey", () => {
  const src = read("src/app/team/employee/page.tsx");
  assert.match(src, /<Avatar name=\{profile\.displayName\} src=\{profile\.avatarUrl \?\? undefined\} size=\{56\} ring \/>/);
  assert.doesNotMatch(src, /storageKey/i);
});

test("UI-E: the Learning section never dumps every lesson onto the first viewport — each program row starts collapsed (useState(false)) and only reveals its lessons once tapped open", () => {
  const src = read("src/app/team/employee/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ProgramRow"), src.indexOf("function LessonRow"));
  assert.match(fnSrc, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(fnSrc, /\{open && program\.lessons\.length > 0 && \(/);
});

/* ===================================================================== *
 *  Home question attention (section 16)
 * ===================================================================== */

function cityManagerHomeFnSrc(): string {
  const src = read("src/app/home/page.tsx");
  return src.slice(src.indexOf("function CityManagerHomeSection"), src.indexOf("function ReturnToCityCabinetCard"));
}

test("ATTN-Q-A: CITY_MANAGER Home pushes a 'N новых вопросов' attention item, routing to /questions, gated strictly on questionsNewCount > 0", () => {
  const fnSrc = cityManagerHomeFnSrc();
  assert.match(fnSrc, /if \(block\.questionsNewCount > 0\) \{\s*\n\s*attentionItems\.push\(\{/);
  const pushIdx = fnSrc.indexOf('key: "new-questions"');
  assert.ok(pushIdx > 0);
  const block = fnSrc.slice(pushIdx, pushIdx + 300);
  assert.match(block, /icon: MessageSquare/);
  assert.match(block, /onClick: \(\) => router\.push\("\/questions"\)/);
});

test("ATTN-Q-B: the permanent 'Вопросы сотрудников' Home row (questionsSubtitle/the compact ManagementListRow) is untouched by this addition — still present, still reading the same real field", () => {
  const fnSrc = cityManagerHomeFnSrc();
  assert.match(fnSrc, /const questionsSubtitle =/);
  assert.match(fnSrc, /title="Вопросы сотрудников"/);
});

test("ATTN-Q-C: CLUB_MANAGER's own section does NOT get this attention item — section 16's explicit 'do not add for CLUB_MANAGER unless real routing supports it', and ClubManagerHomeBlockDTO has no questionsNewCount field to read in the first place", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.length);
  assert.doesNotMatch(fnSrc, /new-questions|questionsNewCount/);
});

test("ATTN-Q-D: the new item never forces a zero-value row — when questionsNewCount is 0, nothing is pushed for it (same 'gate before push' pattern every other attention item in this function already uses)", () => {
  const fnSrc = cityManagerHomeFnSrc();
  const ifIdx = fnSrc.indexOf("if (block.questionsNewCount > 0)");
  const pushIdx = fnSrc.indexOf('key: "new-questions"');
  assert.ok(ifIdx > 0 && pushIdx > ifIdx && pushIdx - ifIdx < 200);
});
